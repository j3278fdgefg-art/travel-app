import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput,
} from 'react-native';
import { useGlobalSearchParams, router } from 'expo-router';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { ItineraryItem } from '../../../types';

const WMO_EMOJI: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: '晴天' },
  1: { emoji: '🌤️', label: '大致晴' },
  2: { emoji: '⛅', label: '局部雲' },
  3: { emoji: '☁️', label: '陰天' },
  45: { emoji: '🌫️', label: '霧' },
  48: { emoji: '🌫️', label: '霧凇' },
  51: { emoji: '🌦️', label: '毛毛雨' },
  53: { emoji: '🌦️', label: '毛毛雨' },
  55: { emoji: '🌧️', label: '濃毛毛雨' },
  61: { emoji: '🌧️', label: '小雨' },
  63: { emoji: '🌧️', label: '中雨' },
  65: { emoji: '🌧️', label: '大雨' },
  71: { emoji: '🌨️', label: '小雪' },
  73: { emoji: '🌨️', label: '中雪' },
  75: { emoji: '❄️', label: '大雪' },
  80: { emoji: '🌦️', label: '陣雨' },
  81: { emoji: '🌧️', label: '陣雨' },
  82: { emoji: '⛈️', label: '暴雨' },
  95: { emoji: '⛈️', label: '雷雨' },
  96: { emoji: '⛈️', label: '雷雨冰雹' },
  99: { emoji: '⛈️', label: '強雷雨' },
};

function getWmo(code: number) {
  return WMO_EMOJI[code] ?? WMO_EMOJI[Math.floor(code / 10) * 10] ?? { emoji: '🌡️', label: '' };
}

interface DayWeather {
  date: string;
  max: number;
  min: number;
  rain: number;
  code: number;
}

async function fetchWeather(destination: string): Promise<DayWeather[]> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=zh`
    );
    const geoData = await geoRes.json();
    if (!geoData.results?.length) return [];
    const { latitude, longitude } = geoData.results[0];

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&timezone=auto&forecast_days=16`
    );
    const wData = await wRes.json();
    const { time, temperature_2m_max, temperature_2m_min, precipitation_probability_max, weathercode } = wData.daily;
    return time.map((date: string, i: number) => ({
      date,
      max: Math.round(temperature_2m_max[i]),
      min: Math.round(temperature_2m_min[i]),
      rain: precipitation_probability_max[i] ?? 0,
      code: weathercode[i] ?? 0,
    }));
  } catch {
    return [];
  }
}

const ITEM_TYPES = [
  { key: 'transport', label: '交通', emoji: '🚗' },
  { key: 'accommodation', label: '住宿', emoji: '🏨' },
  { key: 'food', label: '餐飲', emoji: '🍽️' },
  { key: 'attraction', label: '景點', emoji: '📸' },
  { key: 'other', label: '其他', emoji: '📌' },
] as const;

const DOT_COLORS: Record<string, string> = {
  transport: '#5A8AAD', accommodation: '#9B6BBF',
  food: '#D4A853', attraction: '#5AAD6B', other: '#AD5A5A',
};

// 從 Google Maps URL 解析地點名稱和搜尋關鍵字
function parseGoogleMapsUrl(url: string): { placeName: string; searchQuery: string } | null {
  if (!url.includes('google.com/maps') && !url.includes('maps.app.goo') && !url.includes('goo.gl/maps')) return null;
  // 解析 /place/地點名稱/
  const placeMatch = url.match(/\/place\/([^/@?]+)/);
  if (placeMatch) {
    const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    return { placeName: name, searchQuery: name };
  }
  // 解析 ?q= 參數
  const qMatch = url.match(/[?&]q=([^&]+)/);
  if (qMatch) {
    const name = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    return { placeName: name, searchQuery: name };
  }
  return { placeName: url, searchQuery: url };
}

const emptyForm = () => ({
  time: '', title: '', location: '', locationUrl: '', note: '',
  type: 'attraction' as ItineraryItem['type'],
});

export default function ItineraryScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, days, items, fetchDays, fetchItems, addItineraryItem, deleteItineraryItem, updateItineraryItem } = useTripStore();
  const id = params.id || currentTrip?.id || '';

  const [selectedDay, setSelectedDay] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [timeHour, setTimeHour] = useState('');
  const [timeMin, setTimeMin] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [urlDetected, setUrlDetected] = useState(false);
  const [weatherMap, setWeatherMap] = useState<Record<string, DayWeather>>({});
  const minInputRef = useRef<any>(null);

  useEffect(() => { if (id) { fetchDays(id); fetchItems(id); } }, [id]);

  useEffect(() => {
    const dest = currentTrip?.destination || currentTrip?.name;
    if (!dest) return;
    fetchWeather(dest).then((list) => {
      const map: Record<string, DayWeather> = {};
      list.forEach((d) => { map[d.date] = d; });
      setWeatherMap(map);
    });
  }, [currentTrip?.destination, currentTrip?.name]);

  const currentDayItems = items
    .filter((i) => days[selectedDay] && i.day_id === days[selectedDay].id)
    .sort((a, b) => a.time.localeCompare(b.time));

  const setField = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleLocationInput = (text: string) => {
    setLocationInput(text);
    const parsed = parseGoogleMapsUrl(text);
    if (parsed) {
      setUrlDetected(true);
      setField('location', parsed.placeName);
      setField('locationUrl', text);
    } else {
      setUrlDetected(false);
      setField('location', text);
      setField('locationUrl', '');
    }
  };

  const applyTime = (h: string, m: string) => {
    const hh = h.padStart(2, '0');
    const mm = m.padStart(2, '0');
    setField('time', `${hh}:${mm}`);
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm(emptyForm());
    setTimeHour(''); setTimeMin('');
    setLocationInput('');
    setUrlDetected(false);
    setModalVisible(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingItem(item);
    const [h = '', m = ''] = (item.time || '').split(':');
    setTimeHour(h); setTimeMin(m);
    setForm({
      time: item.time,
      title: item.title,
      location: item.location || '',
      locationUrl: (item as any).location_url || '',
      note: item.note || '',
      type: item.type,
    });
    setLocationInput(item.location || '');
    setUrlDetected(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.time) return;
    const day = days[selectedDay];
    if (!day) return;
    if (editingItem) {
      await updateItineraryItem(editingItem.id, {
        time: form.time, title: form.title, location: form.location,
        note: form.note, type: form.type,
      });
    } else {
      await addItineraryItem({
        trip_id: id, day_id: day.id,
        time: form.time, title: form.title, location: form.location,
        note: form.note, type: form.type,
        order_index: currentDayItems.length,
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (item: ItineraryItem) => {
    if (window.confirm(`確定刪除「${item.title}」？`)) deleteItineraryItem(item.id);
  };

  const openInMap = (item: ItineraryItem) => {
    const q = item.location || item.title;
    router.push(`/trip/${id}/map?q=${encodeURIComponent(q)}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/trips')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripName} numberOfLines={1}>{currentTrip?.name ?? '行程'}</Text>
          <Text style={styles.tripDate}>
            {currentTrip ? `${dayjs(currentTrip.start_date).format('YYYY/MM/DD')} - ${dayjs(currentTrip.end_date).format('MM/DD')}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayScrollContent}>
        {days.map((day, idx) => {
          const d = dayjs(day.date);
          const isSelected = idx === selectedDay;
          return (
            <TouchableOpacity key={day.id} style={[styles.dayBtn, isSelected && styles.dayBtnSelected]} onPress={() => setSelectedDay(idx)}>
              <Text style={[styles.dayBtnLabel, isSelected && styles.dayBtnLabelSelected]}>Day {day.day_number}</Text>
              <Text style={[styles.dayBtnDate, isSelected && styles.dayBtnDateSelected]}>{d.format('M/D')}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.timeline} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* 天氣條 */}
        {days[selectedDay] && (() => {
          const w = weatherMap[days[selectedDay].date];
          if (!w) return null;
          const { emoji, label } = getWmo(w.code);
          return (
            <View style={styles.weatherBar}>
              <Text style={styles.weatherEmoji}>{emoji}</Text>
              <Text style={styles.weatherLabel}>{label}</Text>
              <Text style={styles.weatherTemp}>{w.min}°～{w.max}°C</Text>
              <View style={styles.weatherRainWrap}>
                <Text style={styles.weatherRainIcon}>☂️</Text>
                <Text style={styles.weatherRain}>{w.rain}%</Text>
              </View>
            </View>
          );
        })()}

        {currentDayItems.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyText}>今天還沒有行程</Text>
            <Text style={styles.emptySubtext}>點擊右下角 + 新增</Text>
          </View>
        ) : (
          currentDayItems.map((item, idx) => (
            <View key={item.id} style={styles.timelineRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeText}>{item.time}</Text>
              </View>
              <View style={styles.dotCol}>
                <View style={[styles.dot, { backgroundColor: DOT_COLORS[item.type] }]} />
                {idx < currentDayItems.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemEmoji}>{ITEM_TYPES.find((t) => t.key === item.type)?.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.location ? (
                      <TouchableOpacity onPress={() => openInMap(item)}>
                        <Text style={styles.itemLocation}>📍 {item.location} <Text style={styles.mapLink}>在地圖查看 →</Text></Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
                  </View>
                  <View style={styles.itemBtns}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                      <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editingItem ? '編輯行程' : '新增行程項目'}</Text>

            <Text style={styles.label}>類型</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typeRow}>
                {ITEM_TYPES.map((t) => (
                  <TouchableOpacity key={t.key} style={[styles.typeBtn, form.type === t.key && styles.typeBtnSelected]} onPress={() => setField('type', t.key)}>
                    <Text>{t.emoji} {t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>時間 *</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={styles.timeInput}
                value={timeHour}
                onChangeText={(v) => {
                  const num = v.replace(/\D/g, '').slice(0, 2);
                  if (num !== '' && Number(num) > 23) return;
                  setTimeHour(num);
                  applyTime(num, timeMin);
                  if (num.length === 2) minInputRef.current?.focus();
                }}
                placeholder="09"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                maxLength={2}
                textAlign="center"
              />
              <Text style={styles.timeSep}>:</Text>
              <TextInput
                ref={minInputRef}
                style={styles.timeInput}
                value={timeMin}
                onChangeText={(v) => {
                  const num = v.replace(/\D/g, '').slice(0, 2);
                  if (num !== '' && Number(num) > 59) return;
                  setTimeMin(num);
                  applyTime(timeHour, num);
                }}
                placeholder="00"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                maxLength={2}
                textAlign="center"
              />
            </View>

            <Text style={styles.label}>名稱 *</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setField('title', v)} placeholder="VIA INN 岡山 入住" placeholderTextColor={Colors.textLight} />

            <Text style={styles.label}>地點（可貼上 Google 地圖網址）</Text>
            <TextInput
              style={styles.input}
              value={locationInput}
              onChangeText={handleLocationInput}
              placeholder="地點名稱 或 https://maps.google.com/..."
              placeholderTextColor={Colors.textLight}
              multiline={false}
            />
            {urlDetected && (
              <View style={styles.urlDetectedBox}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.urlDetectedText}>已辨識 Google 地圖連結：{form.location}</Text>
              </View>
            )}

            <Text style={styles.label}>備注</Text>
            <TextInput style={[styles.input, { height: 72 }]} value={form.note} onChangeText={(v) => setField('note', v)} placeholder="..." placeholderTextColor={Colors.textLight} multiline />

            <View style={[styles.modalBtns, { marginBottom: 40 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleSave}>
                <Text style={styles.createText}>{editingItem ? '儲存' : '新增'}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primary },
  backBtn: { marginRight: 10, padding: 4 },
  tripName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  tripDate: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  dayScroll: { maxHeight: 72, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayScrollContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dayBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, alignItems: 'center', minWidth: 64 },
  dayBtnSelected: { backgroundColor: Colors.primary },
  dayBtnLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  dayBtnLabelSelected: { color: '#fff' },
  dayBtnDate: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  dayBtnDateSelected: { color: '#fff' },
  timeline: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  weatherBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  weatherEmoji: { fontSize: 22 },
  weatherLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  weatherTemp: { fontSize: 14, fontWeight: '600', color: Colors.text },
  weatherRainWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 },
  weatherRainIcon: { fontSize: 13 },
  weatherRain: { fontSize: 13, color: Colors.info, fontWeight: '600' },
  timelineRow: { flexDirection: 'row', marginBottom: 8 },
  timeCol: { width: 50, paddingTop: 10 },
  timeText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  dotCol: { width: 24, alignItems: 'center', marginRight: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 10 },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 4 },
  itemCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemEmoji: { fontSize: 20, marginTop: 2 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  itemLocation: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  mapLink: { color: Colors.primary, fontWeight: '500' },
  itemNote: { fontSize: 12, color: Colors.textLight, marginTop: 4 },
  itemBtns: { flexDirection: 'column', gap: 4 },
  editBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.background },
  deleteBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2' },
  emptyDay: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: 13, color: Colors.textSecondary, marginTop: 6 },
  fab: { position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  urlDetectedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  urlDetectedText: { fontSize: 12, color: Colors.success, flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { flex: 1, height: 60, backgroundColor: Colors.background, borderRadius: 14, fontSize: 28, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' },
  timeSep: { fontSize: 32, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  typeBtnSelected: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
