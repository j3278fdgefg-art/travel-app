import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Alert, FlatList,
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

export default function BookingsScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, bookings, fetchBookings, addBooking } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const [activeTab, setActiveTab] = useState<Booking['type']>('flight');
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    title: '', booking_ref: '', provider: '',
    from_location: '', to_location: '',
    departure_time: '', arrival_time: '',
    check_in: '', check_out: '',
    amount: '', currency: 'TWD',
    member_names: '', note: '',
  });

  useEffect(() => { if (id) fetchBookings(id); }, [id]);

  const filtered = bookings.filter((b) => b.type === activeTab);

  const setField = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleAdd = async () => {
    if (!form.title) return Alert.alert('請填寫標題');
    await addBooking({
      trip_id: id,
      type: activeTab,
      ...form,
      amount: parseFloat(form.amount) || 0,
    });
    setModalVisible(false);
    setForm({ title: '', booking_ref: '', provider: '', from_location: '', to_location: '',
      departure_time: '', arrival_time: '', check_in: '', check_out: '',
      amount: '', currency: 'TWD', member_names: '', note: '' });
  };

  const renderBooking = (b: Booking) => (
    <View key={b.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{TABS.find((t) => t.key === b.type)?.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{b.title}</Text>
          {b.member_names ? <Text style={styles.cardMembers}>{b.member_names}</Text> : null}
        </View>
        <View style={styles.boardingPass}>
          <Text style={styles.boardingPassText}>BOARDING PASS</Text>
        </View>
      </View>

      {(b.from_location || b.to_location) && (
        <View style={styles.routeRow}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.airportCode}>{b.from_location}</Text>
          </View>
          <Ionicons name="airplane" size={20} color={Colors.primary} style={{ marginHorizontal: 12 }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.airportCode}>{b.to_location}</Text>
          </View>
        </View>
      )}

      {(b.departure_time || b.arrival_time) && (
        <View style={styles.timeRow}>
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
        <View style={styles.timeRow}>
          <View>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={styles.timeValue}>{b.check_in}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.timeLabel}>Check-out</Text>
            <Text style={styles.timeValue}>{b.check_out}</Text>
          </View>
        </View>
      )}

      <View style={styles.cardFooter}>
        {b.booking_ref ? <Text style={styles.footerText}>訂位代號：{b.booking_ref}</Text> : null}
        {b.amount > 0 ? (
          <Text style={styles.footerAmount}>{b.currency} {b.amount.toLocaleString()}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>預訂管理</Text>
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>機票總金額</Text>
        <Text style={styles.totalAmount}>
          {bookings.filter((b) => b.type === 'flight').reduce((s, b) => s + b.amount, 0).toLocaleString()}
        </Text>
        <Ionicons name="airplane" size={48} color="rgba(255,255,255,0.2)" style={styles.totalIcon} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
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
        ) : (
          filtered.map(renderBooking)
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBox}>
            <Text style={styles.modalTitle}>新增 {BOOKING_TYPES[activeTab]}</Text>

            {[
              { key: 'title', label: '標題 *', placeholder: '台灣虎航 IT262' },
              { key: 'booking_ref', label: '訂位代號', placeholder: 'ABC123' },
              { key: 'provider', label: '航空/飯店名稱', placeholder: '台灣虎航' },
              ...(activeTab === 'flight' ? [
                { key: 'from_location', label: '出發地 (IATA)', placeholder: 'KHH' },
                { key: 'to_location', label: '目的地 (IATA)', placeholder: 'OKJ' },
                { key: 'departure_time', label: '出發時間', placeholder: '12:40' },
                { key: 'arrival_time', label: '抵達時間', placeholder: '16:30' },
              ] : []),
              ...(activeTab === 'hotel' ? [
                { key: 'check_in', label: 'Check-in', placeholder: '2026-04-20' },
                { key: 'check_out', label: 'Check-out', placeholder: '2026-04-21' },
              ] : []),
              { key: 'member_names', label: '乘客/住客', placeholder: '修平 美欣 洋洋' },
              { key: 'amount', label: '金額', placeholder: '13947' },
              { key: 'currency', label: '幣別', placeholder: 'TWD' },
              { key: 'note', label: '備注', placeholder: '托運 20kg' },
            ].map(({ key, label, placeholder }) => (
              <View key={key}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={(form as any)[key]}
                  onChangeText={(v) => setField(key, v)}
                  placeholder={placeholder}
                  placeholderTextColor={Colors.textLight}
                  keyboardType={key === 'amount' ? 'numeric' : 'default'}
                />
              </View>
            ))}

            <View style={[styles.modalBtns, { marginBottom: 60 }]}>
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
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: 12, backgroundColor: Colors.background,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  tabLabelActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardMembers: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  boardingPass: {
    backgroundColor: Colors.accent, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  boardingPassText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  routeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  airportCode: { fontSize: 28, fontWeight: '700', color: Colors.text },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  timeLabel: { fontSize: 11, color: Colors.textSecondary },
  timeValue: { fontSize: 16, fontWeight: '600', color: Colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  footerText: { fontSize: 12, color: Colors.textSecondary },
  footerAmount: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.textSecondary },
  fab: {
    position: 'absolute', bottom: 80, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    elevation: 5,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: {
    height: 46, backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
