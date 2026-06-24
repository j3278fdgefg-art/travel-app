import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { Colors } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { Trip } from '../../types';

const TRIP_EMOJIS = ['✈️','🗺️','🏖️','🏔️','🏯','🌸','🍜','🚗','🛳️','🎌'];

export default function TripsScreen() {
  const { user, signOut } = useAuthStore();
  const { trips, loading, fetchTrips, createTrip, setCurrentTrip, deleteTrip } = useTripStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('✈️');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) fetchTrips(user.id);
  }, [user]);

  const openTrip = (trip: Trip) => {
    setCurrentTrip(trip);
    router.push(`/trip/${trip.id}/itinerary`);
  };

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) return Alert.alert('請填寫旅程名稱和日期');
    setCreating(true);
    const trip = await createTrip({
      name,
      destination,
      start_date: startDate,
      end_date: endDate,
      cover_emoji: selectedEmoji,
      owner_id: user!.id,
    });
    setCreating(false);
    if (trip) {
      setModalVisible(false);
      setName(''); setDestination(''); setStartDate(''); setEndDate('');
      openTrip(trip);
    }
  };

  const handleDelete = (item: Trip) => {
    if (item.owner_id !== user?.id) return;
    if (window.confirm(`確定要刪除「${item.name}」？此操作無法復原。`)) {
      deleteTrip(item.id);
    }
  };

  const renderTrip = ({ item }: { item: Trip }) => {
    const start = dayjs(item.start_date);
    const end = dayjs(item.end_date);
    const days = end.diff(start, 'day') + 1;
    const isOwner = item.owner_id === user?.id;
    return (
      <View style={styles.cardWrap}>
        <TouchableOpacity style={styles.card} onPress={() => openTrip(item)} activeOpacity={0.8}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardEmoji}>{item.cover_emoji}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.destination ? <Text style={styles.cardSub}>📍 {item.destination}</Text> : null}
            <Text style={styles.cardDate}>
              {start.format('MM/DD')} - {end.format('MM/DD')} · {days} 天
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>你好 👋</Text>
          <Text style={styles.headerTitle}>我的旅程</Text>
        </View>
        <TouchableOpacity onPress={async () => { await signOut(); router.replace('/(auth)/login'); }} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>登出</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          renderItem={renderTrip}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={styles.emptyText}>還沒有旅程</Text>
              <Text style={styles.emptySubtext}>點擊下方按鈕開始規劃</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ 新增旅程</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>建立新旅程</Text>

            <Text style={styles.label}>選擇圖示</Text>
            <View style={styles.emojiRow}>
              {TRIP_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, selectedEmoji === e && styles.emojiBtnSelected]}
                  onPress={() => setSelectedEmoji(e)}
                >
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>旅程名稱 *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="例：日本岡山廣島親子自駕行" placeholderTextColor={Colors.textLight} />

            <Text style={styles.label}>目的地</Text>
            <TextInput style={styles.input} value={destination} onChangeText={setDestination}
              placeholder="例：日本岡山・廣島" placeholderTextColor={Colors.textLight} />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>出發日 *</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={startDate} onChange={(e: any) => setStartDate(e.target.value)} style={webDateStyle} />
                ) : (
                  <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-04-20" placeholderTextColor={Colors.textLight} />
                )}
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>回程日 *</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={endDate} onChange={(e: any) => setEndDate(e.target.value)} style={webDateStyle} />
                ) : (
                  <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-04-27" placeholderTextColor={Colors.textLight} />
                )}
              </View>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>建立</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const webDateStyle: any = {
  height: 46, backgroundColor: Colors.background, borderRadius: 12,
  paddingLeft: 14, paddingRight: 14, fontSize: 15, color: Colors.text,
  border: `1px solid ${Colors.border}`, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  greeting: { fontSize: 14, color: Colors.textSecondary },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.text },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.border, borderRadius: 10 },
  signOutText: { color: Colors.textSecondary, fontSize: 13 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
  cardWrap: { marginBottom: 12, position: 'relative' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: 16, padding: 16,
    shadowColor: Colors.shadow, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  deleteBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#FEE2E2', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  deleteBtnText: { fontSize: 14 },
  cardLeft: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  cardEmoji: { fontSize: 28 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  cardDate: { fontSize: 12, color: Colors.textLight },
  arrow: { fontSize: 22, color: Colors.textLight, marginLeft: 8 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: 14, color: Colors.textSecondary, marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: Colors.primary, borderRadius: 30,
    paddingVertical: 16, paddingHorizontal: 32,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: {
    height: 46, backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  emojiBtnSelected: { backgroundColor: Colors.primaryLight, borderWidth: 2, borderColor: Colors.primary },
  emojiText: { fontSize: 22 },
  dateRow: { flexDirection: 'row' },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: {
    flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
