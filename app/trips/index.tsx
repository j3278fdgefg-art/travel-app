import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Alert, ActivityIndicator, Platform, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { useSettingsStore } from '../../store/settingsStore';
import { PageBackground } from '../../components/PageBackground';
import { Trip } from '../../types';

const DEFAULT_TRIP_EMOJIS = ['✈️', '🚗', '🗺️'];
const today = dayjs().format('YYYY-MM-DD');

function loadUserEmojis(userId: string): string[] {
  try {
    const s = localStorage.getItem(`trip_icons_${userId}`);
    return s ? JSON.parse(s) : DEFAULT_TRIP_EMOJIS;
  } catch { return DEFAULT_TRIP_EMOJIS; }
}
function saveUserEmojis(userId: string, list: string[]) {
  localStorage.setItem(`trip_icons_${userId}`, JSON.stringify(list));
}

const webDateStyle: any = {
  height: 46, backgroundColor: Colors.background, borderRadius: 12,
  paddingLeft: 14, paddingRight: 14, fontSize: 15, color: Colors.text,
  border: `1px solid ${Colors.border}`, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};

export default function TripsScreen() {
  const { height: winHeight } = useWindowDimensions();
  const { user, signOut } = useAuthStore();
  const { trips, loading, fetchTrips, createTrip, setCurrentTrip, deleteTrip } = useTripStore();
  const { background } = useSettingsStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('✈️');
  const [creating, setCreating] = useState(false);
  const [tripEmojis, setTripEmojis] = useState(DEFAULT_TRIP_EMOJIS);
  const [addingEmoji, setAddingEmoji] = useState(false);
  const [newEmojiInput, setNewEmojiInput] = useState('');

  useEffect(() => {
    if (user) {
      fetchTrips(user.id);
      setTripEmojis(loadUserEmojis(user.id));
    }
  }, [user]);

  const handleAddEmoji = () => {
    const e = newEmojiInput.trim();
    if (e && !tripEmojis.includes(e)) {
      const next = [...tripEmojis, e];
      setTripEmojis(next);
      if (user) saveUserEmojis(user.id, next);
    }
    setNewEmojiInput('');
    setAddingEmoji(false);
  };

  const handleRemoveEmoji = (e: string) => {
    const next = tripEmojis.filter((x) => x !== e);
    setTripEmojis(next);
    if (user) saveUserEmojis(user.id, next);
    if (selectedEmoji === e) setSelectedEmoji(next[0] || '✈️');
  };

  const openTrip = (trip: Trip) => {
    setCurrentTrip(trip);
    router.push(`/trip/${trip.id}/itinerary`);
  };

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) return Alert.alert('請填寫旅程名稱和日期');
    if (endDate < startDate) return Alert.alert('回程日不能早於出發日');
    setCreating(true);
    const trip = await createTrip({
      name, destination, start_date: startDate, end_date: endDate,
      cover_emoji: selectedEmoji, owner_id: user!.id,
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
    if (window.confirm(`確定要刪除「${item.name}」？此操作無法復原。`)) deleteTrip(item.id);
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
            <Text style={styles.cardDate}>{start.format('MM/DD')} - {end.format('MM/DD')} · {days} 天</Text>
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
      <PageBackground variant={background} />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>我的旅程</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.signOutBtn}>
            <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => { await signOut(); router.replace('/(auth)/login'); }} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>登出</Text>
          </TouchableOpacity>
        </View>
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
          <View style={[styles.modalWrapper, { maxHeight: winHeight * 0.92 }]}>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>建立新旅程</Text>

            <Text style={styles.label}>選擇圖示</Text>
            <View style={styles.emojiRow}>
              {tripEmojis.map((e) => (
                <View key={e} style={styles.emojiBtnWrap}>
                  <TouchableOpacity
                    style={[styles.emojiBtn, selectedEmoji === e && styles.emojiBtnSelected]}
                    onPress={() => setSelectedEmoji(e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.emojiRemove} onPress={() => handleRemoveEmoji(e)}>
                    <Text style={styles.emojiRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {addingEmoji ? (
                <View style={styles.emojiAddRow}>
                  <TextInput
                    style={styles.emojiAddInput}
                    value={newEmojiInput}
                    onChangeText={setNewEmojiInput}
                    placeholder="emoji"
                    maxLength={4}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.emojiConfirmBtn} onPress={handleAddEmoji}>
                    <Text style={styles.emojiConfirmText}>✓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.emojiAddBtn} onPress={() => setAddingEmoji(true)}>
                  <Text style={styles.emojiAddBtnText}>+</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>旅程名稱 *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="例：日本岡山廣島親子自駕行" placeholderTextColor={Colors.textLight} />

            <Text style={styles.label}>目的地</Text>
            <TextInput style={styles.input} value={destination} onChangeText={setDestination}
              placeholder="例：日本岡山・廣島" placeholderTextColor={Colors.textLight} />

            <Text style={styles.label}>出發日 *</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={startDate} min={today}
                onChange={(e: any) => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(''); }}
                style={webDateStyle} />
            ) : (
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-04-20" placeholderTextColor={Colors.textLight} />
            )}

            <Text style={styles.label}>回程日 *</Text>
            {Platform.OS === 'web' ? (
              <input type="date" value={endDate} min={startDate || today}
                onChange={(e: any) => setEndDate(e.target.value)}
                style={webDateStyle} />
            ) : (
              <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-04-27" placeholderTextColor={Colors.textLight} />
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>建立</Text>}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  greeting: { fontSize: 14, color: Colors.textSecondary },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.text },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.border, borderRadius: 10 },
  signOutText: { color: Colors.textSecondary, fontSize: 13 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
  cardWrap: { marginBottom: 12, position: 'relative' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 16, padding: 16, shadowColor: Colors.shadow, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  deleteBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  deleteBtnText: { fontSize: 14 },
  cardLeft: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
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
  fab: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: Colors.primary, borderRadius: 30, paddingVertical: 16, paddingHorizontal: 32, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalWrapper: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalScroll: { flex: 1, padding: 24 },
  modalContent: { paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  emojiBtnWrap: { position: 'relative' },
  emojiBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emojiBtnSelected: { backgroundColor: Colors.primaryLight, borderWidth: 2, borderColor: Colors.primary },
  emojiText: { fontSize: 24 },
  emojiRemove: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, justifyContent: 'center', alignItems: 'center' },
  emojiRemoveText: { color: '#fff', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  emojiAddBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  emojiAddBtnText: { fontSize: 22, color: Colors.textSecondary },
  emojiAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emojiAddInput: { width: 56, height: 48, backgroundColor: Colors.background, borderRadius: 12, textAlign: 'center', fontSize: 20, color: Colors.text, borderWidth: 1, borderColor: Colors.primary },
  emojiConfirmBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  emojiConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
