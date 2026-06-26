export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_emoji: string;
  owner_id: string;
  created_at: string;
  map_list_url?: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string | null;
  display_name: string;
  avatar_emoji: string;
  role: 'owner' | 'member';
  email?: string;
  line_id?: string;
  ig_handle?: string;
}

export interface ItineraryDay {
  id: string;
  trip_id: string;
  date: string;
  day_number: number;
}

export interface ItineraryItem {
  id: string;
  day_id: string;
  trip_id: string;
  time: string;
  title: string;
  location: string;
  location_url?: string;
  note: string;
  type: 'transport' | 'accommodation' | 'food' | 'attraction' | 'other';
  order_index: number;
  transit_mode?: string;
  transit_min?: number;
}

export interface Booking {
  id: string;
  trip_id: string;
  type: 'flight' | 'hotel' | 'car' | 'voucher';
  title: string;
  booking_ref: string;
  provider: string;
  from_location: string;
  to_location: string;
  check_in: string;
  check_out: string;
  departure_time: string;
  arrival_time: string;
  amount: number;
  currency: string;
  member_names: string;
  note: string;
  created_at: string;
  created_by_user_id?: string;
  created_by_name?: string;
  visible_to_members?: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  amount_twd: number;
  paid_by_member_id: string;
  paid_by_name: string;
  payment_method: 'card' | 'cash';
  date: string;
  category: 'food' | 'transport' | 'accommodation' | 'shopping' | 'activity' | 'insurance' | 'other';
  shared_with: string[];
  note: string;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  trip_id: string;
  member_id: string | null;
  member_name: string | null;
  type: 'todo' | 'packing' | 'shopping';
  content: string;
  is_done: boolean;
  created_at: string;
}

export interface Favorite {
  id: string;
  trip_id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  place_id?: string;
  note?: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES = {
  food: '餐飲',
  transport: '交通',
  accommodation: '住宿',
  shopping: '購物',
  activity: '活動',
  insurance: '保險',
  other: '其他',
} as const;

export const BOOKING_TYPES = {
  flight: '機票',
  hotel: '住宿',
  car: '租車',
  voucher: '憑證',
} as const;

export const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'HKD', 'SGD'] as const;

export const EXCHANGE_RATES: Record<string, number> = {
  TWD: 1,
  JPY: 0.22,
  USD: 32.5,
  EUR: 35.0,
  KRW: 0.024,
  HKD: 4.15,
  SGD: 24.0,
};
