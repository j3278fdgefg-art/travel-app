import { create } from 'zustand';
import { Trip, TripMember, ItineraryDay, ItineraryItem, Booking, Expense, ChecklistItem } from '../types';
import { supabase } from '../lib/supabase';

export interface ActivityLog {
  id: string;
  trip_id: string;
  member_name: string;
  action: string;
  detail: string;
  created_at: string;
}

interface TripStore {
  trips: Trip[];
  currentTrip: Trip | null;
  members: TripMember[];
  days: ItineraryDay[];
  items: ItineraryItem[];
  bookings: Booking[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  activityLogs: ActivityLog[];
  loading: boolean;

  fetchTrips: (userId: string) => Promise<void>;
  fetchTripById: (tripId: string) => Promise<void>;
  setCurrentTrip: (trip: Trip) => void;
  createTrip: (data: Partial<Trip>) => Promise<Trip | null>;
  fetchMembers: (tripId: string) => Promise<void>;
  fetchDays: (tripId: string) => Promise<void>;
  fetchItems: (tripId: string) => Promise<void>;
  fetchBookings: (tripId: string) => Promise<void>;
  fetchExpenses: (tripId: string) => Promise<void>;
  fetchChecklist: (tripId: string) => Promise<void>;
  addExpense: (expense: Partial<Expense>) => Promise<void>;
  addChecklistItem: (item: Partial<ChecklistItem>) => Promise<void>;
  toggleChecklistItem: (id: string, done: boolean) => Promise<void>;
  addItineraryItem: (item: Partial<ItineraryItem>) => Promise<void>;
  addBooking: (booking: Partial<Booking>) => Promise<void>;
  addMember: (member: Partial<TripMember>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  updateMemberPermission: (id: string, canEdit: boolean) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteChecklistItem: (id: string) => Promise<void>;
  updateChecklistItem: (id: string, content: string) => Promise<void>;
  deleteItineraryItem: (id: string) => Promise<void>;
  updateItineraryItem: (id: string, data: Partial<ItineraryItem>) => Promise<void>;
  updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  logActivity: (tripId: string, memberName: string, action: string, detail?: string) => Promise<void>;
  fetchActivityLogs: (tripId: string) => Promise<void>;
}

export const useTripStore = create<TripStore>((set, get) => ({
  trips: [],
  currentTrip: null,
  members: [],
  days: [],
  items: [],
  bookings: [],
  expenses: [],
  checklist: [],
  activityLogs: [],
  loading: false,

  fetchTrips: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('trips')
      .select('*')
      .or(`owner_id.eq.${userId}`)
      .order('start_date', { ascending: true });
    set({ trips: data || [], loading: false });
  },

  fetchTripById: async (tripId) => {
    const { data } = await supabase.from('trips').select('*').eq('id', tripId).single();
    if (data) set({ currentTrip: data });
  },

  setCurrentTrip: (trip) => set({ currentTrip: trip }),

  createTrip: async (data) => {
    const { data: trip, error } = await supabase
      .from('trips')
      .insert(data)
      .select()
      .single();
    if (error || !trip) {
      console.error('createTrip error:', error);
      return null;
    }
    // 自動建立每天行程欄位
    await supabase.rpc('create_itinerary_days', { p_trip_id: trip.id });
    set((s) => ({ trips: [...s.trips, trip] }));
    return trip;
  },

  fetchMembers: async (tripId) => {
    const { data } = await supabase
      .from('trip_members')
      .select('*')
      .eq('trip_id', tripId);
    set({ members: data || [] });
  },

  fetchDays: async (tripId) => {
    const { data } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('day_number');
    // 如果沒有天數資料，自動建立
    if (!data || data.length === 0) {
      await supabase.rpc('create_itinerary_days', { p_trip_id: tripId });
      const { data: newData } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('trip_id', tripId)
        .order('day_number');
      set({ days: newData || [] });
    } else {
      set({ days: data });
    }
  },

  fetchItems: async (tripId) => {
    const { data } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('time');
    set({ items: data || [] });
  },

  fetchBookings: async (tripId) => {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at');
    set({ bookings: data || [] });
  },

  fetchExpenses: async (tripId) => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', tripId)
      .order('date', { ascending: false });
    set({ expenses: data || [] });
  },

  fetchChecklist: async (tripId) => {
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at');
    set({ checklist: data || [] });
  },

  addExpense: async (expense) => {
    const { data, error } = await supabase.from('expenses').insert(expense).select().single();
    if (error) console.error('addExpense error:', error);
    if (data) set((s) => ({ expenses: [data, ...s.expenses] }));
  },

  addChecklistItem: async (item) => {
    const { data, error } = await supabase.from('checklist_items').insert(item).select().single();
    if (error) console.error('addChecklistItem error:', error);
    if (data) set((s) => ({ checklist: [...s.checklist, data] }));
  },

  toggleChecklistItem: async (id, done) => {
    const { error } = await supabase.from('checklist_items').update({ is_done: done }).eq('id', id);
    if (error) console.error('toggleChecklistItem error:', error);
    set((s) => ({
      checklist: s.checklist.map((i) => (i.id === id ? { ...i, is_done: done } : i)),
    }));
  },

  addItineraryItem: async (item) => {
    const { data, error } = await supabase.from('itinerary_items').insert(item).select().single();
    if (error) console.error('addItineraryItem error:', error);
    if (data) set((s) => ({ items: [...s.items, data] }));
  },

  addBooking: async (booking) => {
    const { data, error } = await supabase.from('bookings').insert(booking).select().single();
    if (error) console.error('addBooking error:', error);
    if (data) set((s) => ({ bookings: [...s.bookings, data] }));
  },

  addMember: async (member) => {
    const { data, error } = await supabase.from('trip_members').insert(member).select().single();
    if (error) console.error('addMember error:', error);
    if (data) set((s) => ({ members: [...s.members, data] }));
  },

  removeMember: async (id) => {
    await supabase.from('trip_members').delete().eq('id', id);
    set((s) => ({ members: s.members.filter((m) => m.id !== id) }));
  },

  deleteExpense: async (id) => {
    await supabase.from('expenses').delete().eq('id', id);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },

  deleteChecklistItem: async (id) => {
    await supabase.from('checklist_items').delete().eq('id', id);
    set((s) => ({ checklist: s.checklist.filter((i) => i.id !== id) }));
  },

  updateChecklistItem: async (id, content) => {
    await supabase.from('checklist_items').update({ content }).eq('id', id);
    set((s) => ({
      checklist: s.checklist.map((i) => (i.id === id ? { ...i, content } : i)),
    }));
  },

  deleteItineraryItem: async (id) => {
    await supabase.from('itinerary_items').delete().eq('id', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  updateItineraryItem: async (id, data) => {
    const { error } = await supabase.from('itinerary_items').update(data).eq('id', id);
    if (error) console.error('updateItineraryItem error:', error);
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...data } : i)) }));
  },

  updateExpense: async (id, data) => {
    const { error } = await supabase.from('expenses').update(data).eq('id', id);
    if (error) console.error('updateExpense error:', error);
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...data } : e)) }));
  },

  logActivity: async (tripId, memberName, action, detail = '') => {
    await supabase.from('activity_logs').insert({ trip_id: tripId, member_name: memberName, action, detail });
    const { data } = await supabase.from('activity_logs').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(50);
    set({ activityLogs: data || [] });
  },

  fetchActivityLogs: async (tripId) => {
    const { data } = await supabase.from('activity_logs').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(50);
    set({ activityLogs: data || [] });
  },

  updateMemberPermission: async (id, canEdit) => {
    await supabase.from('trip_members').update({ can_edit: canEdit } as any).eq('id', id);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? { ...m, can_edit: canEdit } as any : m)),
    }));
  },
}));
