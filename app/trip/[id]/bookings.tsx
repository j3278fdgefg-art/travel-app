import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Platform,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { Booking, BOOKING_TYPES } from '../../../types';

const TABS: Array<{ key: Booking['type']; label: string; emoji: string }> = [
  { key: 'flight', label: '機票', emoji: '✈️' },
  { key: 'hotel', label: '住宿', emoji: '🏨' },
  { key: 'car', label: '租車', emoji: '🚗' },
  { key: 'voucher', label: '憑證', emoji: '🎫' },
];

const webDateStyle: any = {
  height: 46, backgroundColor: Colors.background, borderRadius: 12,
  paddingLeft: 14, fontSize: 15, color: Colors.text,
  border: `1px solid ${Colors.border}`, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};

const emptyForm = () => ({
  // 機票
  airline: '', flight_number: '',
  from_city: '', from_terminal: '',
  to_city: '', to_terminal: '',
  dep_hour: '', dep_min: '',
  arr_hour: '', arr_min: '',
  seat_number: '',
  // 住宿
  check_in: '', check_out: '',
  // 租車
  pickup: '', dropoff: '',
  // 共用
  title: '', booking_ref: '',
  amount: '', currency: 'TWD',
  note: '',
});

export default function BookingsScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, bookings, members, fetchBookings, fetchMembers, fetchTripById, addBooking } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const [activeTab, setActiveTab] = useState<Booking['type']>('flight');
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  const depMinRef = useRef<any>(null);
  const arrMinRef = useRef<any>(null);

  useEffect(() => {
    if (id) { fetchTripById(id); fetchBookings(id); fetchMembers(id); }
  }, [id]);

  const filtered = bookings.filter((b) => b.type === activeTab);
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleMember = (name: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const openModal = () => {
    setForm(emptyForm());
    setSelectedMembers(new Set());
    setModalVisible(true);
  };

  const handleAdd = async () => {
    const memberStr = [...selectedMembers].join('、');
    let payload: Partial<Booking> = {
      trip_id: id, type: activeTab,
      booking_ref: form.booking_ref,
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      member_names: memberStr,
      note: form.note,
    } as any;

    if (activeTab === 'flight') {
      const title = [form.airline, form.flight_number].filter(Boolean).join(' ');
      if (!title) { alert('請填寫航空公司或航班號'); return; }
      payload = {
        ...payload,
        title,
        provider: form.airline,
        from_location: [form.from_city, form.from_terminal].filter(Boolean).join(' '),
        to_location: [form.to_city, form.to_terminal].filter(Boolean).join(' '),
        departure_time: form.dep_hour ? `${form.dep_hour.padStart(2, '0')}:${form.dep_min.padStart(2, '0')}` : '',
        arrival_time: form.arr_hour ? `${form.arr_hour.padStart(2, '0')}:${form.arr_min.padStart(2, '0')}` : '',
        note: [form.seat_number ? `座位：${form.seat_number}` : '', form.note].filter(Boolean).join(' | '),
      };
    } else if (activeTab === 'hotel') {
      if (!form.title) { alert('請填寫飯店名稱'); return; }
      if (currentTrip?.start_date && currentTrip?.end_date) {
        if (form.check_in && (form.check_in < currentTrip.start_date || form.check_in > currentTrip.end_date)) {
          alert(`Check-in 日期不在行程時間內\n行程：${currentTrip.start_date} ～ ${currentTrip.end_date}`); return;
        }
        if (form.check_out && (form.check_out < currentTrip.start_date || form.check_out > currentTrip.end_date)) {
          alert(`Check-out 日期不在行程時間內\n行程：${currentTrip.start_date} ～ ${currentTrip.end_date}`); return;
        }
      }
      payload = { ...payload, title: form.title, check_in: form.check_in, check_out: form.check_out };
    } else if (activeTab === 'car') {
      if (!form.title) { alert('請填寫租車資訊'); return; }
      payload = {
        ...payload, title: form.title,
        from_location: form.pickup, to_location: form.dropoff,
      };
    } else {
      if (!form.title) { alert('請填寫憑證名稱'); return; }
      payload = { ...payload, title: form.title };
    }

    await addBooking(payload);
    setModalVisible(false);
  };

  // ── 分拆時間輸入 ──────────────────────────
  const TimeInput = ({
    hourVal, minVal, onHourChange, onMinChange, minRef,
  }: {
    hourVal: string; minVal: string;
    onHourChange: (v: string) => void;
    onMinChange: (v: string) => void;
    minRef?: any;
  }) => (
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
        }}
        placeholder="00" placeholderTextColor={Colors.textLight}
        keyboardType="numeric" maxLength={2} textAlign="center"
      />
    </View>
  );

  // ── 成員多選 ──────────────────────────────
  const MemberSelect = () => (
    <View style={styles.memberGrid}>
      {members.map((m) => (
        <TouchableOpacity
          key={m.id}
          style={[styles.memberChip, selectedMembers.has(m.display_name) && styles.memberChipSelected]}
          onPress={() => toggleMember(m.display_name)}
        >
          <Text style={{ fontSize: 14 }}>{m.avatar_emoji}</Text>
          <Text style={[styles.chipText, selectedMembers.has(m.display_name) && { color: '#fff' }]}>
            {m.display_name}
          </Text>
          {selectedMembers.has(m.display_name) && (
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── 卡片 ──────────────────────────────────
  const renderBooking = (b: Booking) => (
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
          <Ionicons name="airplane" size={18} color={Colors.primary} style={{ marginHorizontal: 10 }} />
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
    </View>
  );

  // ── Modal 表單 ────────────────────────────
  const renderForm = () => {
    if (activeTab === 'flight') return (
      <>
        <View style={styles.rowFields}>
          <View style={{ flex: 3 }}>
            <Text style={styles.label}>航空公司</Text>
            <TextInput style={styles.input} value={form.airline} onChangeText={(v) => setField('airline', v)} placeholder="台灣虎航" placeholderTextColor={Colors.textLight} />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>航班號</Text>
            <TextInput style={styles.input} value={form.flight_number} onChangeText={(v) => setField('flight_number', v)} placeholder="IT262" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />
          </View>
        </View>

        <Text style={styles.label}>訂位代號</Text>
        <TextInput style={styles.input} value={form.booking_ref} onChangeText={(v) => setField('booking_ref', v)} placeholder="ABC123" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />

        <Text style={styles.label}>出發地</Text>
        <TextInput style={styles.input} value={form.from_city} onChangeText={(v) => setField('from_city', v)} placeholder="高雄 / KHH" placeholderTextColor={Colors.textLight} />
        <TextInput style={[styles.input, { marginTop: 6 }]} value={form.from_terminal} onChangeText={(v) => setField('from_terminal', v)} placeholder="航站" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>目的地</Text>
        <TextInput style={styles.input} value={form.to_city} onChangeText={(v) => setField('to_city', v)} placeholder="岡山 / OKJ" placeholderTextColor={Colors.textLight} />
        <TextInput style={[styles.input, { marginTop: 6 }]} value={form.to_terminal} onChangeText={(v) => setField('to_terminal', v)} placeholder="航站" placeholderTextColor={Colors.textLight} />

        <View style={styles.timePairRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>出發時間</Text>
            <TimeInput
              hourVal={form.dep_hour} minVal={form.dep_min}
              onHourChange={(v) => setField('dep_hour', v)}
              onMinChange={(v) => setField('dep_min', v)}
              minRef={depMinRef}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>抵達時間</Text>
            <TimeInput
              hourVal={form.arr_hour} minVal={form.arr_min}
              onHourChange={(v) => setField('arr_hour', v)}
              onMinChange={(v) => setField('arr_min', v)}
              minRef={arrMinRef}
            />
          </View>
        </View>

        <Text style={styles.label}>乘客</Text>
        <MemberSelect />

        <Text style={styles.label}>座位</Text>
        <TextInput style={styles.input} value={form.seat_number} onChangeText={(v) => setField('seat_number', v)} placeholder="21A / 22B" placeholderTextColor={Colors.textLight} />
      </>
    );

    if (activeTab === 'hotel') return (
      <>
        <Text style={styles.label}>飯店名稱 *</Text>
        <TextInput style={styles.input} value={form.title} onChangeText={(v) => setField('title', v)} placeholder="住宿資訊" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>訂位代號</Text>
        <TextInput style={styles.input} value={form.booking_ref} onChangeText={(v) => setField('booking_ref', v)} placeholder="ABC123" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>Check-in</Text>
        {Platform.OS === 'web'
          ? <input type="date" value={form.check_in} onChange={(e: any) => setField('check_in', e.target.value)} style={webDateStyle} />
          : <TextInput style={styles.input} value={form.check_in} onChangeText={(v) => setField('check_in', v)} placeholder="2026-04-20" placeholderTextColor={Colors.textLight} />}

        <Text style={styles.label}>Check-out</Text>
        {Platform.OS === 'web'
          ? <input type="date" value={form.check_out} onChange={(e: any) => setField('check_out', e.target.value)} style={webDateStyle} />
          : <TextInput style={styles.input} value={form.check_out} onChangeText={(v) => setField('check_out', v)} placeholder="2026-04-21" placeholderTextColor={Colors.textLight} />}

        <Text style={styles.label}>住客</Text>
        <MemberSelect />
      </>
    );

    if (activeTab === 'car') return (
      <>
        <Text style={styles.label}>租車公司 / 車型 *</Text>
        <TextInput style={styles.input} value={form.title} onChangeText={(v) => setField('title', v)} placeholder="租車資訊" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>訂位代號</Text>
        <TextInput style={styles.input} value={form.booking_ref} onChangeText={(v) => setField('booking_ref', v)} placeholder="ABC123" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>取車地點</Text>
        <TextInput style={styles.input} value={form.pickup} onChangeText={(v) => setField('pickup', v)} placeholder="岡山機場" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>還車地點</Text>
        <TextInput style={styles.input} value={form.dropoff} onChangeText={(v) => setField('dropoff', v)} placeholder="廣島市區" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>乘客</Text>
        <MemberSelect />
      </>
    );

    return (
      <>
        <Text style={styles.label}>憑證名稱 *</Text>
        <TextInput style={styles.input} value={form.title} onChangeText={(v) => setField('title', v)} placeholder="景點門票 / 體驗券" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>序號 / 兌換碼</Text>
        <TextInput style={styles.input} value={form.booking_ref} onChangeText={(v) => setField('booking_ref', v)} placeholder="VOUCHER123" placeholderTextColor={Colors.textLight} />

        <Text style={styles.label}>適用人</Text>
        <MemberSelect />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>預訂管理</Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>機票總金額 (TWD)</Text>
        <Text style={styles.totalAmount}>
          {bookings.filter((b) => b.type === 'flight').reduce((s, b) => s + b.amount, 0).toLocaleString()}
        </Text>
        <Ionicons name="airplane" size={48} color="rgba(255,255,255,0.2)" style={styles.totalIcon} />
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
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{TABS.find((t) => t.key === activeTab)?.emoji}</Text>
            <Text style={styles.emptyText}>還沒有{BOOKING_TYPES[activeTab]}資料</Text>
          </View>
        ) : filtered.map(renderBooking)}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
            <Text style={styles.modalTitle}>新增{BOOKING_TYPES[activeTab]}</Text>

            {renderForm()}

            <View style={styles.rowFields}>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>金額</Text>
                <TextInput style={styles.input} value={form.amount} onChangeText={(v) => setField('amount', v)} placeholder="13947" placeholderTextColor={Colors.textLight} keyboardType="numeric" />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>幣別</Text>
                <TextInput style={styles.input} value={form.currency} onChangeText={(v) => setField('currency', v.toUpperCase())} placeholder="TWD" placeholderTextColor={Colors.textLight} autoCapitalize="characters" maxLength={3} />
              </View>
            </View>

            <Text style={styles.label}>備注</Text>
            <TextInput
              style={[styles.input, { height: 68, textAlignVertical: 'top', paddingTop: 10 }]}
              value={form.note} onChangeText={(v) => setField('note', v)}
              placeholder="補充說明..." placeholderTextColor={Colors.textLight} multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleAdd}>
                <Text style={styles.createText}>新增</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  totalCard: {
    marginHorizontal: 20, borderRadius: 16, backgroundColor: Colors.primaryDark,
    padding: 20, marginBottom: 16, overflow: 'hidden',
  },
  totalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 },
  totalAmount: { color: '#fff', fontSize: 36, fontWeight: '700' },
  totalIcon: { position: 'absolute', right: 16, bottom: 8 },
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
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, borderRadius: 12, padding: 12, marginBottom: 8 },
  airportCode: { fontSize: 22, fontWeight: '700', color: Colors.text },
  flightTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  timeLabel: { fontSize: 11, color: Colors.textSecondary },
  timeValue: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 4 },
  footerNote: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  footerAmount: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.textSecondary },
  fab: { position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  rowFields: { flexDirection: 'row', alignItems: 'flex-end' },
  timePairRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { flex: 1, height: 60, backgroundColor: Colors.background, borderRadius: 14, fontSize: 28, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' },
  timeSep: { fontSize: 32, fontWeight: '700', color: Colors.text },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  memberChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
