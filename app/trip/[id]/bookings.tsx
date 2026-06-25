import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Platform, useWindowDimensions,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useAuthStore } from '../../../store/authStore';
import { Booking, BOOKING_TYPES } from '../../../types';

const TABS: Array<{ key: Booking['type']; label: string; emoji: string }> = [
  { key: 'flight', label: '機票', emoji: '✈️' },
  { key: 'hotel', label: '住宿', emoji: '🏨' },
  { key: 'car', label: '租車', emoji: '🚗' },
  { key: 'voucher', label: '憑證', emoji: '🎫' },
];

const EMPTY_DESC: Record<Booking['type'], string> = {
  flight: '把航班、訂位代號、座位資訊存進來',
  hotel: '把住宿名稱、入住/退房日期存進來',
  car: '把租車公司、取還車地點存進來',
  voucher: '把景點門票、體驗券、交通票券的兌換碼存進來',
};

// 由出發/抵達時間（HH:MM）估算飛行時間
function flightDuration(dep: string, arr: string): string {
  if (!dep || !arr) return '';
  const [dh, dm] = dep.split(':').map(Number);
  const [ah, am] = arr.split(':').map(Number);
  if ([dh, dm, ah, am].some((n) => Number.isNaN(n))) return '';
  let mins = (ah * 60 + am) - (dh * 60 + dm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}` || '0m';
}

const webDateStyle: any = {
  height: 46, backgroundColor: Colors.background, borderRadius: 12,
  paddingLeft: 14, fontSize: 15, color: Colors.text,
  border: `1px solid ${Colors.border}`, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};

const emptyForm = () => ({
  airline: '', flight_number: '',
  from_city: '', from_terminal: '',
  to_city: '', to_terminal: '',
  dep_hour: '', dep_min: '',
  arr_hour: '', arr_min: '',
  seat_number: '',
  check_in: '', check_out: '',
  pickup: '', dropoff: '',
  title: '', booking_ref: '',
  amount: '', currency: 'TWD',
  note: '',
});

// Defined OUTSIDE BookingsScreen so React doesn't remount on every render (fixes focus loss)
function TimeInput({
  hourVal, minVal, onHourChange, onMinChange, minRef, nextRef,
}: {
  hourVal: string; minVal: string;
  onHourChange: (v: string) => void;
  onMinChange: (v: string) => void;
  minRef?: React.RefObject<any>;
  nextRef?: React.RefObject<any>;
}) {
  return (
    <View style={styles.timeRow}>
      <TextInput
        style={styles.timeInput}
        value={hourVal}
        onChangeText={(v) => {
          const n = v.replace(/\D/g, '').slice(0, 2);
          if (n !== '' && Number(n) > 23) return;
          onHourChange(n);
          if (n.length === 2) minRef?.current?.focus();
        }}
        placeholder="09" placeholderTextColor={Colors.textLight}
        keyboardType="numeric" maxLength={2} textAlign="center"
        returnKeyType="next"
        onSubmitEditing={() => minRef?.current?.focus()}
      />
      <Text style={styles.timeSep}>:</Text>
      <TextInput
        ref={minRef}
        style={styles.timeInput}
        value={minVal}
        onChangeText={(v) => {
          const n = v.replace(/\D/g, '').slice(0, 2);
          if (n !== '' && Number(n) > 59) return;
          onMinChange(n);
          if (n.length === 2) nextRef?.current?.focus();
        }}
        placeholder="00" placeholderTextColor={Colors.textLight}
        keyboardType="numeric" maxLength={2} textAlign="center"
        returnKeyType="next"
        onSubmitEditing={() => nextRef?.current?.focus()}
      />
    </View>
  );
}

export default function BookingsScreen() {
  const { height: winHeight } = useWindowDimensions();
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, bookings, members, fetchBookings, fetchMembers, fetchTripById, addBooking, updateBooking, deleteBooking } = useTripStore();
  const { user } = useAuthStore();
  const id = params.id || currentTrip?.id || '';
  const [activeTab, setActiveTab] = useState<Booking['type']>('flight');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [visibleTo, setVisibleTo] = useState<Set<string>>(new Set());

  // refs for Enter key chaining
  const flightNumRef = useRef<any>(null);
  const bookingRefRef = useRef<any>(null);
  const fromCityRef = useRef<any>(null);
  const fromTermRef = useRef<any>(null);
  const toCityRef = useRef<any>(null);
  const toTermRef = useRef<any>(null);
  const depMinRef = useRef<any>(null);
  const arrHourRef = useRef<any>(null);
  const arrMinRef = useRef<any>(null);
  const seatRef = useRef<any>(null);
  const amountRef = useRef<any>(null);
  const noteRef = useRef<any>(null);

  const myMemberName = members.find((m) => m.user_id === user?.id)?.display_name || '';

  useEffect(() => {
    if (id) { fetchTripById(id); fetchBookings(id); fetchMembers(id); }
  }, [id]);

  const filtered = bookings.filter((b) => {
    if (b.type !== activeTab) return false;
    if (!b.visible_to_members) return true;
    if (b.created_by_user_id === user?.id) return true;
    if (!myMemberName) return true;
    return b.visible_to_members.split('、').includes(myMemberName);
  });

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleMember = (name: string) => {
    setSelectedMembers((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const toggleVisibleTo = (name: string) => {
    setVisibleTo((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const openModal = () => {
    setEditingBooking(null);
    setForm(emptyForm());
    setSelectedMembers(new Set());
    setVisibleTo(new Set());
    setModalVisible(true);
  };

  const openEdit = (b: Booking) => {
    setEditingBooking(b);
    const [depH = '', depM = ''] = (b.departure_time || '').split(':');
    const [arrH = '', arrM = ''] = (b.arrival_time || '').split(':');
    const flightNum = b.provider ? b.title.replace(b.provider, '').trim() : b.title;
    setForm({
      airline: b.provider || '',
      flight_number: b.type === 'flight' ? flightNum : '',
      from_city: b.from_location || '',
      from_terminal: '',
      to_city: b.to_location || '',
      to_terminal: '',
      dep_hour: depH, dep_min: depM,
      arr_hour: arrH, arr_min: arrM,
      seat_number: '',
      check_in: b.check_in || '',
      check_out: b.check_out || '',
      pickup: b.type === 'car' ? (b.from_location || '') : '',
      dropoff: b.type === 'car' ? (b.to_location || '') : '',
      title: b.title || '',
      booking_ref: b.booking_ref || '',
      amount: b.amount ? String(b.amount) : '',
      currency: b.currency || 'TWD',
      note: b.note || '',
    });
    setSelectedMembers(new Set(b.member_names ? b.member_names.split('、') : []));
    setVisibleTo(new Set(b.visible_to_members ? b.visible_to_members.split('、') : []));
    setModalVisible(true);
  };

  const buildPayload = (): Partial<Booking> => {
    const memberStr = [...selectedMembers].join('、');
    const visibleStr = [...visibleTo].join('、');
    let payload: Partial<Booking> = {
      trip_id: id, type: activeTab,
      booking_ref: form.booking_ref,
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      member_names: memberStr,
      note: form.note,
      visible_to_members: visibleStr,
    } as any;

    if (activeTab === 'flight') {
      const title = [form.airline, form.flight_number].filter(Boolean).join(' ');
      payload = {
        ...payload, title,
        provider: form.airline,
        from_location: [form.from_city, form.from_terminal].filter(Boolean).join(' '),
        to_location: [form.to_city, form.to_terminal].filter(Boolean).join(' '),
        departure_time: form.dep_hour ? `${form.dep_hour.padStart(2, '0')}:${form.dep_min.padStart(2, '0')}` : '',
        arrival_time: form.arr_hour ? `${form.arr_hour.padStart(2, '0')}:${form.arr_min.padStart(2, '0')}` : '',
        note: [form.seat_number ? `座位：${form.seat_number}` : '', form.note].filter(Boolean).join(' | '),
      };
    } else if (activeTab === 'hotel') {
      payload = { ...payload, title: form.title, check_in: form.check_in, check_out: form.check_out };
    } else if (activeTab === 'car') {
      payload = { ...payload, title: form.title, from_location: form.pickup, to_location: form.dropoff };
    } else {
      payload = { ...payload, title: form.title };
    }
    return payload;
  };

  const handleSave = async () => {
    if (activeTab === 'flight' && ![form.airline, form.flight_number].some(Boolean)) {
      alert('請填寫航空公司或航班號'); return;
    }
    if (activeTab !== 'flight' && !form.title) {
      alert('請填寫名稱'); return;
    }
    const payload = buildPayload();

    if (editingBooking) {
      await updateBooking(editingBooking.id, payload);
    } else {
      await addBooking({
        ...payload,
        created_by_user_id: user?.id || '',
        created_by_name: myMemberName || user?.email || '',
      } as any);
    }
    setModalVisible(false);
  };

  const handleDelete = (b: Booking) => {
    if (window.confirm(`確定刪除「${b.title}」？`)) deleteBooking(b.id);
  };

  const renderBooking = (b: Booking) => {
    const isMyBooking = !b.created_by_user_id || b.created_by_user_id === user?.id;
    return (
      <View key={b.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{TABS.find((t) => t.key === b.type)?.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{b.title}</Text>
            {b.member_names ? <Text style={styles.cardMembers}>👥 {b.member_names}</Text> : null}
          </View>
          {b.booking_ref ? (
            <View style={styles.refBadge}>
              <Text style={styles.refText}>{b.booking_ref}</Text>
            </View>
          ) : null}
        </View>

        {(b.from_location || b.to_location) && (
          <View style={styles.routeRow}>
            <Text style={styles.airportCode}>{b.from_location || '—'}</Text>
            <View style={styles.routeMid}>
              <Ionicons name="airplane" size={18} color={Colors.primary} />
              {b.type === 'flight' && !!flightDuration(b.departure_time, b.arrival_time) && (
                <Text style={styles.routeDuration}>{flightDuration(b.departure_time, b.arrival_time)}</Text>
              )}
            </View>
            <Text style={styles.airportCode}>{b.to_location || '—'}</Text>
          </View>
        )}

        {(b.departure_time || b.arrival_time) && (
          <View style={styles.flightTimeRow}>
            <View>
              <Text style={styles.timeLabel}>出發</Text>
              <Text style={styles.timeValue}>{b.departure_time}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.timeLabel}>抵達</Text>
              <Text style={[styles.timeValue, { color: Colors.danger }]}>{b.arrival_time}</Text>
            </View>
          </View>
        )}

        {(b.check_in || b.check_out) && (
          <View style={styles.flightTimeRow}>
            <View><Text style={styles.timeLabel}>Check-in</Text><Text style={styles.timeValue}>{b.check_in}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={styles.timeLabel}>Check-out</Text><Text style={styles.timeValue}>{b.check_out}</Text></View>
          </View>
        )}

        <View style={styles.cardFooter}>
          {b.note ? <Text style={styles.footerNote}>{b.note}</Text> : null}
          {b.amount > 0 ? <Text style={styles.footerAmount}>{b.currency} {b.amount.toLocaleString()}</Text> : null}
        </View>

        {isMyBooking && (
          <View style={styles.cardActions}>
            {!!b.visible_to_members && (
              <Text style={styles.visibleTag}>🔒 限定可見</Text>
            )}
            <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(b)}>
              <Ionicons name="pencil-outline" size={13} color={Colors.primary} />
              <Text style={styles.editBtnText}>編輯</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(b)}>
              <Ionicons name="trash-outline" size={13} color={Colors.danger} />
              <Text style={styles.deleteBtnText}>刪除</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderForm = () => {
    if (activeTab === 'flight') return (
      <>
        <View style={styles.rowFields}>
          <View style={{ flex: 3 }}>
            <Text style={styles.label}>航空公司</Text>
            <TextInput
              style={styles.input} value={form.airline}
              onChangeText={(v) => setField('airline', v)}
              placeholder="台灣虎航" placeholderTextColor={Colors.textLight}
              returnKeyType="next" onSubmitEditing={() => flightNumRef.current?.focus()}
            />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>航班號</Text>
            <TextInput
              ref={flightNumRef}
              style={styles.input} value={form.flight_number}
              onChangeText={(v) => setField('flight_number', v)}
              placeholder="IT262" placeholderTextColor={Colors.textLight}
              autoCapitalize="characters"
              returnKeyType="next" onSubmitEditing={() => bookingRefRef.current?.focus()}
            />
          </View>
        </View>

        <Text style={styles.label}>訂位代號</Text>
        <TextInput
          ref={bookingRefRef}
          style={styles.input} value={form.booking_ref}
          onChangeText={(v) => setField('booking_ref', v)}
          placeholder="ABC123" placeholderTextColor={Colors.textLight}
          autoCapitalize="characters"
          returnKeyType="next" onSubmitEditing={() => fromCityRef.current?.focus()}
        />

        <Text style={styles.label}>出發地</Text>
        <TextInput
          ref={fromCityRef}
          style={styles.input} value={form.from_city}
          onChangeText={(v) => setField('from_city', v)}
          placeholder="高雄 / KHH" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => fromTermRef.current?.focus()}
        />
        <TextInput
          ref={fromTermRef}
          style={[styles.input, { marginTop: 6 }]} value={form.from_terminal}
          onChangeText={(v) => setField('from_terminal', v)}
          placeholder="航站" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => toCityRef.current?.focus()}
        />

        <Text style={styles.label}>目的地</Text>
        <TextInput
          ref={toCityRef}
          style={styles.input} value={form.to_city}
          onChangeText={(v) => setField('to_city', v)}
          placeholder="岡山 / OKJ" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => toTermRef.current?.focus()}
        />
        <TextInput
          ref={toTermRef}
          style={[styles.input, { marginTop: 6 }]} value={form.to_terminal}
          onChangeText={(v) => setField('to_terminal', v)}
          placeholder="航站" placeholderTextColor={Colors.textLight}
        />

        <View style={styles.timePairRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.label}>出發時間</Text>
            <TimeInput
              hourVal={form.dep_hour} minVal={form.dep_min}
              onHourChange={(v) => setField('dep_hour', v)}
              onMinChange={(v) => setField('dep_min', v)}
              minRef={depMinRef} nextRef={arrHourRef}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.label}>抵達時間</Text>
            <TimeInput
              hourVal={form.arr_hour} minVal={form.arr_min}
              onHourChange={(v) => setField('arr_hour', v)}
              onMinChange={(v) => setField('arr_min', v)}
              minRef={arrMinRef} nextRef={seatRef}
            />
          </View>
        </View>

        <Text style={styles.label}>乘客</Text>
        <View style={styles.memberGrid}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberChip, selectedMembers.has(m.display_name) && styles.memberChipSelected]}
              onPress={() => toggleMember(m.display_name)}
            >
              <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
              <Text style={[styles.chipText, selectedMembers.has(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
              {selectedMembers.has(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>座位</Text>
        <TextInput
          ref={seatRef}
          style={styles.input} value={form.seat_number}
          onChangeText={(v) => setField('seat_number', v)}
          placeholder="21A / 22B" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => amountRef.current?.focus()}
        />
      </>
    );

    if (activeTab === 'hotel') return (
      <>
        <Text style={styles.label}>飯店名稱 *</Text>
        <TextInput
          style={styles.input} value={form.title}
          onChangeText={(v) => setField('title', v)}
          placeholder="住宿資訊" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => bookingRefRef.current?.focus()}
        />

        <Text style={styles.label}>訂位代號</Text>
        <TextInput
          ref={bookingRefRef}
          style={styles.input} value={form.booking_ref}
          onChangeText={(v) => setField('booking_ref', v)}
          placeholder="ABC123" placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>Check-in</Text>
        {Platform.OS === 'web'
          ? <input type="date" value={form.check_in} onChange={(e: any) => setField('check_in', e.target.value)} style={webDateStyle} />
          : <TextInput style={styles.input} value={form.check_in} onChangeText={(v) => setField('check_in', v)} placeholder="2026-04-20" placeholderTextColor={Colors.textLight} />}

        <Text style={styles.label}>Check-out</Text>
        {Platform.OS === 'web'
          ? <input type="date" value={form.check_out} onChange={(e: any) => setField('check_out', e.target.value)} style={webDateStyle} />
          : <TextInput style={styles.input} value={form.check_out} onChangeText={(v) => setField('check_out', v)} placeholder="2026-04-21" placeholderTextColor={Colors.textLight} />}

        <Text style={styles.label}>住客</Text>
        <View style={styles.memberGrid}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberChip, selectedMembers.has(m.display_name) && styles.memberChipSelected]}
              onPress={() => toggleMember(m.display_name)}
            >
              <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
              <Text style={[styles.chipText, selectedMembers.has(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
              {selectedMembers.has(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>
      </>
    );

    if (activeTab === 'car') return (
      <>
        <Text style={styles.label}>租車公司 / 車型 *</Text>
        <TextInput
          style={styles.input} value={form.title}
          onChangeText={(v) => setField('title', v)}
          placeholder="租車資訊" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => bookingRefRef.current?.focus()}
        />

        <Text style={styles.label}>訂位代號</Text>
        <TextInput
          ref={bookingRefRef}
          style={styles.input} value={form.booking_ref}
          onChangeText={(v) => setField('booking_ref', v)}
          placeholder="ABC123" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => fromCityRef.current?.focus()}
        />

        <Text style={styles.label}>取車地點</Text>
        <TextInput
          ref={fromCityRef}
          style={styles.input} value={form.pickup}
          onChangeText={(v) => setField('pickup', v)}
          placeholder="岡山機場" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => toCityRef.current?.focus()}
        />

        <Text style={styles.label}>還車地點</Text>
        <TextInput
          ref={toCityRef}
          style={styles.input} value={form.dropoff}
          onChangeText={(v) => setField('dropoff', v)}
          placeholder="廣島市區" placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>乘客</Text>
        <View style={styles.memberGrid}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberChip, selectedMembers.has(m.display_name) && styles.memberChipSelected]}
              onPress={() => toggleMember(m.display_name)}
            >
              <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
              <Text style={[styles.chipText, selectedMembers.has(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
              {selectedMembers.has(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>
      </>
    );

    return (
      <>
        <Text style={styles.label}>憑證名稱 *</Text>
        <TextInput
          style={styles.input} value={form.title}
          onChangeText={(v) => setField('title', v)}
          placeholder="景點門票 / 體驗券" placeholderTextColor={Colors.textLight}
          returnKeyType="next" onSubmitEditing={() => bookingRefRef.current?.focus()}
        />

        <Text style={styles.label}>序號 / 兌換碼</Text>
        <TextInput
          ref={bookingRefRef}
          style={styles.input} value={form.booking_ref}
          onChangeText={(v) => setField('booking_ref', v)}
          placeholder="VOUCHER123" placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.label}>適用人</Text>
        <View style={styles.memberGrid}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberChip, selectedMembers.has(m.display_name) && styles.memberChipSelected]}
              onPress={() => toggleMember(m.display_name)}
            >
              <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
              <Text style={[styles.chipText, selectedMembers.has(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
              {selectedMembers.has(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>預訂管理</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={styles.tabEmoji}>{t.emoji}</Text>
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.length === 0 ? (
          <TouchableOpacity style={styles.emptyCta} onPress={openModal} activeOpacity={0.8}>
            <Text style={styles.emptyEmoji}>{TABS.find((t) => t.key === activeTab)?.emoji}</Text>
            <Text style={styles.emptyTitle}>還沒有{BOOKING_TYPES[activeTab]}</Text>
            <Text style={styles.emptyDesc}>{EMPTY_DESC[activeTab]}</Text>
            <View style={styles.emptyAddBtn}>
              <Text style={styles.emptyAddText}>＋ 新增{BOOKING_TYPES[activeTab]}</Text>
            </View>
          </TouchableOpacity>
        ) : filtered.map(renderBooking)}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalWrapper, { maxHeight: winHeight * 0.92 }]}>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingBooking ? '編輯' : '新增'}{BOOKING_TYPES[activeTab]}</Text>

            {renderForm()}

            <View style={styles.rowFields}>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>金額</Text>
                <TextInput
                  ref={amountRef}
                  style={styles.input} value={form.amount}
                  onChangeText={(v) => setField('amount', v)}
                  placeholder="13947" placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                  returnKeyType="next" onSubmitEditing={() => noteRef.current?.focus()}
                />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>幣別</Text>
                <TextInput style={styles.input} value={form.currency} onChangeText={(v) => setField('currency', v.toUpperCase())} placeholder="TWD" placeholderTextColor={Colors.textLight} autoCapitalize="characters" maxLength={3} />
              </View>
            </View>

            <Text style={styles.label}>備注</Text>
            <TextInput
              ref={noteRef}
              style={[styles.input, { height: 68, textAlignVertical: 'top', paddingTop: 10 }]}
              value={form.note} onChangeText={(v) => setField('note', v)}
              placeholder="補充說明..." placeholderTextColor={Colors.textLight} multiline
            />

            <Text style={styles.label}>可見成員（空白 = 所有人可見）</Text>
            <View style={styles.memberGrid}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberChip, visibleTo.has(m.display_name) && styles.memberChipSelected]}
                  onPress={() => toggleVisibleTo(m.display_name)}
                >
                  <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
                  <Text style={[styles.chipText, visibleTo.has(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
                  {visibleTo.has(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            {visibleTo.size > 0 && (
              <Text style={styles.visibleHint}>🔒 僅選中的成員可看到此預訂</Text>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleSave}>
                <Text style={styles.createText}>{editingBooking ? '儲存' : '新增'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  tabs: {
    flexDirection: 'row', backgroundColor: Colors.card,
    paddingHorizontal: 16, paddingVertical: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.background },
  tabActive: { backgroundColor: Colors.primary },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  tabLabelActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardMembers: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  refBadge: { backgroundColor: Colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  refText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.background, borderRadius: 12, padding: 12, marginBottom: 8 },
  routeMid: { alignItems: 'center', marginHorizontal: 10 },
  routeDuration: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  airportCode: { fontSize: 22, fontWeight: '700', color: Colors.text },
  flightTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  timeLabel: { fontSize: 11, color: Colors.textSecondary },
  timeValue: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 4 },
  footerNote: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  footerAmount: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  visibleTag: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.primaryLight },
  editBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FEE2E2' },
  deleteBtnText: { fontSize: 12, color: Colors.danger, fontWeight: '500' },
  emptyCta: { alignItems: 'center', marginTop: 40, paddingVertical: 36, paddingHorizontal: 24, borderRadius: 18, borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.5)' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyAddBtn: { marginTop: 18, backgroundColor: Colors.primary, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 14 },
  emptyAddText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalWrapper: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalScroll: { flex: 1, padding: 24 },
  modalContent: { paddingBottom: 60 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  rowFields: { flexDirection: 'row', alignItems: 'flex-end' },
  timePairRow: { flexDirection: 'row', alignItems: 'flex-start', flexShrink: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { flex: 1, minWidth: 0, height: 50, backgroundColor: Colors.background, borderRadius: 14, fontSize: 20, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' },
  timeSep: { fontSize: 24, fontWeight: '700', color: Colors.text, marginHorizontal: 8 },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  memberChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary },
  visibleHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
