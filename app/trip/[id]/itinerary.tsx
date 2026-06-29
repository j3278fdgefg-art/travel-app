import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, useWindowDimensions, Platform,
} from 'react-native';
import { useGlobalSearchParams, router } from 'expo-router';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { PageBackground } from '../../../components/PageBackground';
import { ItineraryItem } from '../../../types';
import { isGoogleMapsUrl, parseGoogleMapsUrl, getMapQuery } from '../../../lib/mapUtils';

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
  sunset: string;
  estimated: boolean;
  cityName?: string;
}

function getClothing(max: number, min: number): string {
  const avg = (max + min) / 2;
  if (avg >= 28) return '短袖';
  if (avg >= 23) return '薄長袖';
  if (avg >= 18) return '薄長袖＋輕薄外套';
  if (avg >= 13) return '長袖＋外套';
  if (avg >= 7) return '厚外套';
  return '羽絨衣';
}

async function geocode(name: string): Promise<{ latitude: number; longitude: number; cityName: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`
    );
    const data = await res.json();
    if (data.results?.length) {
      const r = data.results[0];
      return { latitude: r.latitude, longitude: r.longitude, cityName: r.admin1 || r.name || '' };
    }
  } catch {}
  return null;
}

// 中日韓常見地名 → 英文（open-meteo 地理編碼只認得英文/羅馬拼音）
const CITY_DICT: Record<string, string> = {
  釜山: 'Busan', 首爾: 'Seoul', 濟州: 'Jeju', 仁川: 'Incheon', 大邱: 'Daegu', 慶州: 'Gyeongju',
  東京: 'Tokyo', 大阪: 'Osaka', 京都: 'Kyoto', 岡山: 'Okayama', 廣島: 'Hiroshima', 福岡: 'Fukuoka',
  名古屋: 'Nagoya', 札幌: 'Sapporo', 沖繩: 'Okinawa', 那霸: 'Naha', 神戶: 'Kobe', 橫濱: 'Yokohama',
  曼谷: 'Bangkok', 清邁: 'Chiang Mai', 峴港: 'Da Nang', 河內: 'Hanoi', 胡志明: 'Ho Chi Minh',
  新加坡: 'Singapore', 香港: 'Hong Kong', 澳門: 'Macau', 台北: 'Taipei', 臺北: 'Taipei', 高雄: 'Kaohsiung',
};

// 解析目的地 → 經緯度：先查字典、去掉國名前綴，再交給 open-meteo
async function resolveGeo(destination: string): Promise<{ latitude: number; longitude: number; cityName: string } | null> {
  const stripped = destination.replace(/^(韓國|南韓|北韓|日本|台灣|臺灣|中國|泰國|越南|美國|英國|法國)/, '').trim();
  const candidates: string[] = [];
  for (const key of [stripped, destination]) if (CITY_DICT[key]) candidates.push(CITY_DICT[key]);
  candidates.push(stripped, destination, destination.split(/[,，、・\s/]/)[0].trim());
  for (const c of candidates) {
    if (!c) continue;
    const g = await geocode(c);
    if (g) return g;
  }
  return null;
}

const shiftYear = (date: string, delta: number) => dayjs(date).add(delta, 'year').format('YYYY-MM-DD');

async function fetchWeather(destination: string, tripDates: string[] = []): Promise<DayWeather[]> {
  try {
    const geo = await resolveGeo(destination);
    if (!geo) return [];
    const { latitude, longitude } = geo;

    // 16 天內：真實預報
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset` +
      `&timezone=auto&forecast_days=16`
    );
    const wData = await wRes.json();
    const dd = wData.daily;
    const out: DayWeather[] = dd.time.map((date: string, i: number) => ({
      date,
      max: Math.round(dd.temperature_2m_max[i]),
      min: Math.round(dd.temperature_2m_min[i]),
      rain: dd.precipitation_probability_max[i] ?? 0,
      code: dd.weather_code[i] ?? 0,
      sunset: dd.sunset?.[i] ? dd.sunset[i].slice(11, 16) : '',
      estimated: false,
    }));

    // 超出預報範圍的行程日期：抓「去年同期」歷史天氣當預估
    const have = new Set(out.map((d) => d.date));
    const missing = tripDates.filter((d) => d && !have.has(d)).sort();
    if (missing.length) {
      try {
        const aRes = await fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
          `&start_date=${shiftYear(missing[0], -1)}&end_date=${shiftYear(missing[missing.length - 1], -1)}` +
          `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`
        );
        const aData = await aRes.json();
        const ad = aData.daily;
        ad?.time?.forEach((t: string, i: number) => {
          const tripDate = shiftYear(t, 1);
          if (missing.includes(tripDate)) {
            out.push({
              date: tripDate,
              max: Math.round(ad.temperature_2m_max[i]),
              min: Math.round(ad.temperature_2m_min[i]),
              rain: 0,
              code: ad.weather_code[i] ?? 0,
              sunset: '',
              estimated: true,
            });
          }
        });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

const TRANSIT_MODES: Array<{ emoji: string; label: string }> = [
  { emoji: '🚶', label: '步行' },
  { emoji: '🚌', label: '公車' },
  { emoji: '🚇', label: '地鐵' },
  { emoji: '🚗', label: '開車' },
  { emoji: '🚕', label: '計程車' },
  { emoji: '🚆', label: '火車' },
];
const transitLabel = (e?: string) => TRANSIT_MODES.find((m) => m.emoji === e)?.label || '交通';

const DEFAULT_ITEM_TYPES = ['🏨', '🍽️', '📸'];
const LEGACY_EMOJI: Record<string, string> = {
  transport: '🚗', accommodation: '🏨', food: '🍽️', attraction: '📸', other: '📌',
};
const EMOJI_TO_DB_TYPE: Record<string, string> = {
  '🚗': 'transport', '🏨': 'accommodation', '🍽️': 'food', '📸': 'attraction', '📌': 'other',
};
function toDbType(emoji: string): string {
  return EMOJI_TO_DB_TYPE[emoji] ?? emoji;
}
const PALETTE = ['#5A8AAD', '#9B6BBF', '#D4A853', '#5AAD6B', '#AD5A5A', '#5A9E9E', '#AD7B5A'];

// 依目的地給一個可愛的代表圖示（行程 Day 卡左側）。
// 註：旗幟 emoji 在 Windows 瀏覽器不會顯示（會變成 KR/JP 字母），所以用一般 emoji。
function destFlag(dest: string): string {
  const map: Array<[RegExp, string]> = [
    [/韓國|南韓|首爾|釜山|濟州|仁川|大邱|慶州/, '🐯'],
    [/日本|東京|大阪|京都|岡山|北海道|沖繩|那霸|福岡|名古屋|札幌|神戶|橫濱|廣島/, '🗻'],
    [/台灣|臺灣|台北|臺北|高雄|台中|台南/, '🧋'],
    [/泰國|曼谷|清邁|普吉/, '🐘'],
    [/越南|峴港|河內|胡志明/, '🍜'],
    [/新加坡/, '🦁'],
    [/香港/, '🏙️'],
    [/澳門/, '🎰'],
    [/中國|上海|北京|成都/, '🐼'],
    [/美國|紐約|洛杉磯/, '🗽'],
    [/英國|倫敦/, '🎡'],
    [/法國|巴黎/, '🗼'],
  ];
  for (const [re, icon] of map) if (re.test(dest)) return icon;
  return '🧳';
}

// 垂直虛線（一點一點），可從 color 漸層到 toColor
const DOT_MASK = 'repeating-linear-gradient(to bottom, #000 0 3px, transparent 3px 9px)';
function DottedLine({ color, toColor }: { color: string; toColor?: string }) {
  if (Platform.OS !== 'web') return <View style={{ flex: 1, width: 2, backgroundColor: color }} />;
  const grad = `linear-gradient(${color}, ${toColor || color})`;
  return (
    <div style={{ width: 3, height: '100%', backgroundImage: grad, WebkitMaskImage: DOT_MASK, maskImage: DOT_MASK } as any} />
  );
}

function typeEmoji(t: string) { return LEGACY_EMOJI[t] || t; }
function emojiColor(e: string) {
  let h = 0;
  for (let i = 0; i < e.length; i++) h = e.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function loadItemTypes(userId: string): string[] {
  try { const s = localStorage.getItem(`item_types_${userId}`); return s ? JSON.parse(s) : DEFAULT_ITEM_TYPES; }
  catch { return DEFAULT_ITEM_TYPES; }
}
function saveItemTypes(userId: string, list: string[]) {
  localStorage.setItem(`item_types_${userId}`, JSON.stringify(list));
}



const emptyForm = () => ({
  time: '', title: '', location: '', locationUrl: '', address: '', placeId: '', note: '',
  type: '📸',
});

export default function ItineraryScreen() {
  const { height: winHeight } = useWindowDimensions();
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, days, items, fetchDays, fetchItems, fetchTripById, addItineraryItem, deleteItineraryItem, updateItineraryItem, favorites, fetchFavorites } = useTripStore();
  const { user } = useAuthStore();
  const { background } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';

  const [selectedDay, setSelectedDay] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [addTab, setAddTab] = useState<'manual' | 'favorite'>('manual');
  const [favCatFilter, setFavCatFilter] = useState<string>('all');
  const [transitItem, setTransitItem] = useState<ItineraryItem | null>(null);
  const [transitMode, setTransitMode] = useState('🚶');
  const [transitMin, setTransitMin] = useState('');
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [timeHour, setTimeHour] = useState('');
  const [timeMin, setTimeMin] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [urlDetected, setUrlDetected] = useState(false);
  const [weatherMap, setWeatherMap] = useState<Record<string, DayWeather>>({});
  const [itemWeatherCache, setItemWeatherCache] = useState<Record<string, DayWeather | null>>({});
  const fetchingWeatherRef = useRef(new Set<string>());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [kbOffset, setKbOffset] = useState(0);
  const [itemTypes, setItemTypes] = useState(DEFAULT_ITEM_TYPES);
  const [addingType, setAddingType] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState('');
  const minInputRef = useRef<any>(null);

  useEffect(() => { if (id) { fetchTripById(id); fetchDays(id); fetchItems(id); fetchFavorites(id); } }, [id]);

  useEffect(() => {
    if (user) setItemTypes(loadItemTypes(user.id));
  }, [user]);

  // 手機鍵盤彈出時用 visualViewport 偵測高度差，把 modal 往上推
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const handler = () => setKbOffset(Math.max(0, window.innerHeight - vv.height));
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const dest = currentTrip?.destination || currentTrip?.name;
    if (!dest) return;
    const tripDates = days.map((d) => d.date);
    fetchWeather(dest, tripDates).then((list) => {
      const map: Record<string, DayWeather> = {};
      list.forEach((d) => { map[d.date] = d; });
      setWeatherMap(map);
    });
  }, [currentTrip?.destination, currentTrip?.name, days.length]);

  useEffect(() => {
    if (!expandedItem) return;
    const item = currentDayItems.find((i) => i.id === expandedItem);
    if (!item?.location) return;
    const date = days[selectedDay]?.date;
    if (!date) return;
    const cacheKey = `${item.location}__${date}`;
    if (cacheKey in itemWeatherCache || fetchingWeatherRef.current.has(cacheKey)) return;
    fetchingWeatherRef.current.add(cacheKey);
    resolveGeo(item.location).then(async (geo) => {
      if (!geo) {
        setItemWeatherCache((prev) => ({ ...prev, [cacheKey]: null }));
        fetchingWeatherRef.current.delete(cacheKey);
        return;
      }
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset` +
          `&timezone=auto&forecast_days=16`
        );
        const data = await res.json();
        const dd = data.daily;
        const idx = (dd.time as string[]).indexOf(date);
        const w: DayWeather | null = idx >= 0 ? {
          date,
          max: Math.round(dd.temperature_2m_max[idx]),
          min: Math.round(dd.temperature_2m_min[idx]),
          rain: dd.precipitation_probability_max[idx] ?? 0,
          code: dd.weather_code[idx] ?? 0,
          sunset: dd.sunset?.[idx] ? String(dd.sunset[idx]).slice(11, 16) : '',
          estimated: false,
          cityName: geo.cityName,
        } : null;
        setItemWeatherCache((prev) => ({ ...prev, [cacheKey]: w }));
      } catch {
        setItemWeatherCache((prev) => ({ ...prev, [cacheKey]: null }));
      }
      fetchingWeatherRef.current.delete(cacheKey);
    });
  }, [expandedItem, selectedDay]);

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

  const handleAddType = () => {
    const e = newTypeInput.trim();
    if (e && !itemTypes.includes(e)) {
      const next = [...itemTypes, e];
      setItemTypes(next);
      if (user) saveItemTypes(user.id, next);
    }
    setNewTypeInput(''); setAddingType(false);
  };

  const handleRemoveType = (e: string) => {
    const next = itemTypes.filter((x) => x !== e);
    setItemTypes(next);
    if (user) saveItemTypes(user.id, next);
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm({ ...emptyForm(), type: itemTypes[0] || '📸' });
    setTimeHour(''); setTimeMin('');
    setLocationInput('');
    setUrlDetected(false);
    setAddTab('manual');
    setModalVisible(true);
  };

  // 從收藏清單選一個地點 → 自動帶入名稱、地址、place_id（地圖直接跳資訊卡）
  const pickFavorite = (f: { name: string; address?: string; lat?: number; lng?: number; place_id?: string }) => {
    const url = f.lat != null && f.lng != null ? `https://maps.google.com/?q=${f.lat},${f.lng}` : '';
    setForm((prev) => ({
      ...prev,
      title: f.name,
      location: f.name,        // 地點欄填地標名稱
      locationUrl: url,
      address: f.address || '', // 地址欄填實際地址
      placeId: f.place_id || '',
    }));
    setLocationInput(f.name);
    setUrlDetected(false);
    setAddTab('manual');
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingItem(item);
    setAddTab('manual');
    const [h = '', m = ''] = (item.time || '').split(':');
    setTimeHour(h); setTimeMin(m);
    setForm({
      time: item.time,
      title: item.title,
      location: item.location || '',
      locationUrl: item.location_url || '',
      address: item.address || '',
      placeId: item.place_id || '',
      note: item.note || '',
      type: item.type,
    });
    setLocationInput(item.location || '');
    setUrlDetected(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title) { alert('請填寫行程名稱'); return; }
    if (!form.time) { alert('請填寫時間'); return; }
    const day = days[selectedDay];
    if (!day) return;
    if (editingItem) {
      await updateItineraryItem(editingItem.id, {
        time: form.time, title: form.title, location: form.location,
        location_url: form.locationUrl,
        address: form.address || undefined,
        place_id: form.placeId || undefined,
        note: form.note, type: toDbType(form.type) as any,
      });
    } else {
      await addItineraryItem({
        trip_id: id, day_id: day.id,
        time: form.time, title: form.title, location: form.location,
        location_url: form.locationUrl,
        address: form.address || undefined,
        place_id: form.placeId || undefined,
        note: form.note, type: toDbType(form.type) as any,
        order_index: currentDayItems.length,
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (item: ItineraryItem) => {
    if (window.confirm(`確定刪除「${item.title}」？`)) deleteItineraryItem(item.id);
  };

  const openInMap = (item: ItineraryItem) => {
    if (item.place_id) {
      router.push(`/trip/${id}/map?placeId=${encodeURIComponent(item.place_id)}` as any);
      return;
    }
    const q = item.address?.trim() || item.title.trim() ||
      (item.location || '').replace(/https?:\/\/\S+/g, '').replace(/[，,]\s*$/, '').trim();
    if (q) router.push(`/trip/${id}/map?q=${encodeURIComponent(q)}` as any);
  };

  // 編輯兩個行程間的交通（存在「後一個」項目上）
  const openTransitEdit = (toItem: ItineraryItem) => {
    setTransitItem(toItem);
    setTransitMode(toItem.transit_mode || '🚶');
    setTransitMin(toItem.transit_min ? String(toItem.transit_min) : '');
  };
  const saveTransit = async () => {
    if (!transitItem) return;
    await updateItineraryItem(transitItem.id, { transit_mode: transitMode, transit_min: parseInt(transitMin) || 0 } as any);
    setTransitItem(null);
  };
  const clearTransit = async () => {
    if (!transitItem) return;
    await updateItineraryItem(transitItem.id, { transit_mode: null, transit_min: null } as any);
    setTransitItem(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <PageBackground variant={background} />
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
          const wd = ['日', '一', '二', '三', '四', '五', '六'][d.day()];
          const isSelected = idx === selectedDay;
          return (
            <TouchableOpacity key={day.id} style={[styles.dayBtn, isSelected && styles.dayBtnSelected]} onPress={() => setSelectedDay(idx)}>
              <Text style={[styles.dayBtnLabel, isSelected && styles.dayBtnLabelSelected]}>Day {day.day_number}</Text>
              <Text style={[styles.dayBtnDate, isSelected && styles.dayBtnDateSelected]}>{d.format('M/D')}</Text>
              <Text style={[styles.dayBtnWeekday, isSelected && styles.dayBtnLabelSelected]}>週{wd}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.timeline} contentContainerStyle={{ paddingBottom: 40 }}>

        {currentDayItems.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyText}>今天還沒有行程</Text>
            <Text style={styles.emptySubtext}>點擊下方 ＋ 新增</Text>
          </View>
        ) : (
          currentDayItems.map((item, idx) => {
            const isOpen = expandedItem === item.id;
            const next = currentDayItems[idx + 1];
            const dotColor = emojiColor(typeEmoji(item.type));
            const nextColor = next ? emojiColor(typeEmoji(next.type)) : dotColor;
            return (
              <View key={item.id}>
              <View style={styles.timelineRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>{item.time}</Text>
                </View>
                <View style={styles.dotCol}>
                  <View style={styles.lineCell}>{idx > 0 ? <DottedLine color={dotColor} /> : null}</View>
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                  <View style={styles.lineCell}>{next ? <DottedLine color={dotColor} /> : null}</View>
                </View>
                <View style={styles.itemCard}>
                  {/* 收合狀態：只有圖示 + 名稱 */}
                  <TouchableOpacity style={styles.itemRow} activeOpacity={0.7} onPress={() => setExpandedItem(isOpen ? null : item.id)}>
                    <Text style={styles.itemEmoji}>{typeEmoji(item.type)}</Text>
                    <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={isOpen ? undefined : 1}>{item.title}</Text>
                    <Text style={styles.itemChevron}>{isOpen ? '▾' : '▸'}</Text>
                  </TouchableOpacity>

                  {/* 展開：詳細資訊 */}
                  {isOpen && (
                    <View style={styles.itemDetail}>
                      {(() => {
                        const date = days[selectedDay]?.date ?? '';
                        const cacheKey = `${item.location}__${date}`;
                        const w = item.location
                          ? (itemWeatherCache[cacheKey] ?? weatherMap[date])
                          : weatherMap[date];
                        if (!w) return null;
                        const wmo = getWmo(w.code);
                        return (
                          <View style={styles.itemWeather}>
                            {w.cityName ? <Text style={styles.itemWeatherCity}>📍 {w.cityName}</Text> : null}
                            <Text style={styles.itemWeatherText}>{wmo.emoji} {wmo.label}</Text>
                            <Text style={styles.itemWeatherText}>🌡️ {w.max}° / {w.min}°</Text>
                            <Text style={styles.itemWeatherText}>🌧️ {w.rain}%</Text>
                            {w.estimated && <Text style={styles.itemWeatherEst}>歷年估值</Text>}
                          </View>
                        );
                      })()}
                      {item.note ? (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>📝 {item.note}</Text>
                        </View>
                      ) : null}
                      {item.location ? (
                        <TouchableOpacity style={styles.mapBtn} onPress={() => openInMap(item)}>
                          <Text style={styles.mapBtnText}>🗺️ 在地圖查看</Text>
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.itemBtns}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                          <Text style={styles.itemBtnEmoji}>✏️</Text>
                          <Text style={styles.itemBtnLabel}>編輯</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                          <Text style={styles.itemBtnEmoji}>🗑️</Text>
                          <Text style={[styles.itemBtnLabel, { color: Colors.danger }]}>刪除</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* 兩個行程之間的交通時間（中間直線連續） */}
              {next && (
                <View style={styles.transitRow}>
                  <View style={{ width: 50 }} />
                  <View style={styles.transitDotCol}><DottedLine color={dotColor} toColor={nextColor} /></View>
                  <TouchableOpacity style={styles.transitTouch} activeOpacity={0.7} onPress={() => openTransitEdit(next)}>
                    {next.transit_min ? (
                      <Text style={styles.transitText}>{next.transit_mode || '🚶'} {transitLabel(next.transit_mode)} {next.transit_min} 分</Text>
                    ) : (
                      <Text style={styles.transitAdd}>＋ 加交通時間</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              </View>
            );
          })
        )}

        <View style={styles.timelineRow}>
          <View style={styles.timeCol} />
          <View style={{ width: 24, marginRight: 12 }} />
          <TouchableOpacity style={styles.addDashBox} onPress={openAdd} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color={Colors.textLight} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { paddingBottom: kbOffset }]}>
          <View style={[styles.modalWrapper, { maxHeight: (winHeight - kbOffset) * 0.92 }]}>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>{editingItem ? '編輯行程' : '新增行程項目'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addTabs}>
              <TouchableOpacity style={[styles.addTab, addTab === 'manual' && styles.addTabActive]} onPress={() => setAddTab('manual')}>
                <Text style={[styles.addTabText, addTab === 'manual' && styles.addTabTextActive]}>✏️ 手動輸入</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addTab, addTab === 'favorite' && styles.addTabActive]} onPress={() => setAddTab('favorite')}>
                <Text style={[styles.addTabText, addTab === 'favorite' && styles.addTabTextActive]}>❤️ 收藏清單</Text>
              </TouchableOpacity>
            </View>

            {addTab === 'favorite' && (() => {
              const realFavs = favorites.filter((f) => !f.is_header);
              const favCats = Array.from(new Set(realFavs.map((f) => f.category || '').filter((c) => c !== '')));
              const filtered = favCatFilter === 'all' ? realFavs
                : realFavs.filter((f) => (f.category || '') === favCatFilter);
              return (
                <View style={{ marginTop: 4 }}>
                  {favCats.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.favCatRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 4, paddingVertical: 8 }}>
                      {(['all', '', ...favCats] as string[]).map((cat, idx) => (
                        <TouchableOpacity key={idx} style={[styles.favCatChip, favCatFilter === cat && styles.favCatChipActive]} onPress={() => setFavCatFilter(cat)}>
                          <Text style={[styles.favCatChipText, favCatFilter === cat && styles.favCatChipTextActive]}>
                            {cat === 'all' ? '全部' : cat === '' ? '未分類' : cat}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  {realFavs.length === 0 ? (
                    <Text style={styles.favPickEmpty}>還沒有收藏。到地圖頁點店家、按 🤍 收藏後，這裡就能直接選用。</Text>
                  ) : filtered.length === 0 ? (
                    <Text style={styles.favPickEmpty}>此分類沒有收藏。</Text>
                  ) : filtered.map((f) => (
                    <TouchableOpacity key={f.id} style={styles.favPickRow} onPress={() => pickFavorite(f)}>
                      <Text style={styles.favPickIcon}>❤️</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.favPickName} numberOfLines={1}>{f.name}</Text>
                        {!!f.category && <Text style={[styles.favPickAddr, { color: Colors.primary }]} numberOfLines={1}>#{f.category}</Text>}
                        {!!f.address && <Text style={styles.favPickAddr} numberOfLines={1}>{f.address}</Text>}
                      </View>
                      <Text style={styles.favPickArrow}>帶入 →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

            {addTab === 'manual' && (<>
            <Text style={styles.label}>類型</Text>
            <View style={styles.typeRow}>
              {itemTypes.map((e) => (
                <View key={e} style={styles.typeBtnWrap}>
                  <TouchableOpacity
                    style={[styles.typeBtn, form.type === e && styles.typeBtnSelected]}
                    onPress={() => setField('type', e)}
                  >
                    <Text style={styles.typeBtnEmoji}>{e}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.typeRemove} onPress={() => handleRemoveType(e)}>
                    <Text style={styles.typeRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {addingType ? (
                <View style={styles.typeAddRow}>
                  <TextInput
                    style={styles.typeAddInput}
                    value={newTypeInput}
                    onChangeText={setNewTypeInput}
                    placeholder="emoji"
                    maxLength={4}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.typeConfirmBtn} onPress={handleAddType}>
                    <Text style={styles.typeConfirmText}>✓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.typeAddBtn} onPress={() => setAddingType(true)}>
                  <Text style={styles.typeAddBtnText}>+</Text>
                </TouchableOpacity>
              )}
            </View>

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

            <Text style={styles.label}>地址（用於地圖查找）</Text>
            <TextInput
              style={styles.input}
              value={form.address}
              onChangeText={(v) => setField('address', v)}
              placeholder="台北市大安區敦化南路二段..."
              placeholderTextColor={Colors.textLight}
            />

            <Text style={styles.label}>備注</Text>
            <TextInput style={[styles.input, { height: 72 }]} value={form.note} onChangeText={(v) => setField('note', v)} placeholder="..." placeholderTextColor={Colors.textLight} multiline />
            </>)}

            {addTab === 'manual' && (
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.createBtn} onPress={handleSave}>
                  <Text style={styles.createText}>{editingItem ? '儲存' : '新增'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 交通時間編輯 */}
      <Modal visible={!!transitItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.transitBox}>
            <Text style={styles.modalTitle}>交通時間</Text>
            <Text style={styles.transitToLabel}>到「{transitItem?.title}」</Text>
            <View style={styles.transitModeGrid}>
              {TRANSIT_MODES.map((m) => (
                <TouchableOpacity
                  key={m.emoji}
                  style={[styles.transitModeBtn, transitMode === m.emoji && styles.transitModeBtnSel]}
                  onPress={() => setTransitMode(m.emoji)}
                >
                  <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                  <Text style={[styles.transitModeText, transitMode === m.emoji && { color: '#fff' }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>分鐘</Text>
            <TextInput
              style={styles.input}
              value={transitMin}
              onChangeText={(v) => setTransitMin(v.replace(/\D/g, '').slice(0, 3))}
              placeholder="例：15"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTransitItem(null)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={saveTransit}>
                <Text style={styles.createText}>儲存</Text>
              </TouchableOpacity>
            </View>
            {!!transitItem?.transit_min && (
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 8 }} onPress={clearTransit}>
                <Text style={{ color: Colors.danger, fontSize: 13 }}>清除交通時間</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primaryDark },
  backBtn: { marginRight: 10, padding: 4 },
  tripName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  tripDate: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  dayScroll: { maxHeight: 88, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayScrollContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dayBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, alignItems: 'center', minWidth: 64 },
  dayBtnSelected: { backgroundColor: Colors.primary },
  dayBtnLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  dayBtnLabelSelected: { color: '#fff' },
  dayBtnDate: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  dayBtnDateSelected: { color: '#fff' },
  dayBtnWeekday: { fontSize: 10, color: Colors.textLight, marginTop: 1 },
  timeline: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  timelineRow: { flexDirection: 'row' },
  timeCol: { width: 50, justifyContent: 'center' },
  timeText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  dotCol: { width: 24, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  lineCell: { flex: 1, width: 3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#fff', zIndex: 1 },
  itemCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginVertical: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemEmoji: { fontSize: 20 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  itemChevron: { fontSize: 13, color: Colors.textLight },
  itemDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.background },
  itemWeather: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  itemWeatherCity: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', width: '100%', marginBottom: -4 },
  itemWeatherText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  itemWeatherEst: { fontSize: 10, color: Colors.accent },
  itemLocation: { fontSize: 12, color: Colors.textSecondary },
  mapLink: { color: Colors.primary, fontWeight: '500' },
  itemNote: { fontSize: 12, color: Colors.textLight, marginTop: 6 },
  noteBox: { backgroundColor: Colors.background, borderRadius: 8, padding: 8, marginTop: 8 },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  mapBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.primary, alignSelf: 'flex-start' },
  mapBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  itemBtns: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FEE2E2' },
  itemBtnEmoji: { fontSize: 13 },
  itemBtnLabel: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  transitRow: { flexDirection: 'row', alignItems: 'stretch' },
  transitDotCol: { width: 24, marginRight: 12, alignItems: 'center' },
  transitTouch: { flex: 1, justifyContent: 'center', paddingVertical: 10 },
  transitText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  transitAdd: { fontSize: 12, color: Colors.textLight },
  transitBox: { backgroundColor: Colors.card, borderRadius: 20, padding: 22, width: '88%', maxWidth: 360 },
  transitToLabel: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 14 },
  transitModeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  transitModeBtn: { width: 88, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 2 },
  transitModeBtnSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  transitModeText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  emptyDay: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: 13, color: Colors.textSecondary, marginTop: 6 },
  addDashBox: { flex: 1, marginTop: 4, marginBottom: 8, height: 60, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalWrapper: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalScroll: { flex: 1, padding: 24 },
  modalContent: { paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  addTabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  addTab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  addTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  addTabText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  addTabTextActive: { color: '#fff' },
  favCatRow: { maxHeight: 44, flexShrink: 0 },
  favCatChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.border, borderWidth: 1, borderColor: Colors.border },
  favCatChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  favCatChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  favCatChipTextActive: { color: '#fff' },
  favPickEmpty: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24, lineHeight: 20 },
  favPickSection: { fontSize: 12, fontWeight: '700', color: Colors.primary, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4 },
  favPickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.background, marginBottom: 8 },
  favPickIcon: { fontSize: 16 },
  favPickName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  favPickAddr: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  favPickArrow: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  urlDetectedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  urlDetectedText: { fontSize: 12, color: Colors.success, flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { flex: 1, minWidth: 0, height: 50, backgroundColor: Colors.background, borderRadius: 14, fontSize: 20, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' },
  timeSep: { fontSize: 24, fontWeight: '700', color: Colors.text, marginHorizontal: 8, marginBottom: 2 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  typeBtnWrap: { position: 'relative' },
  typeBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  typeBtnEmoji: { fontSize: 24 },
  typeBtnSelected: { backgroundColor: Colors.primaryLight, borderWidth: 2, borderColor: Colors.primary },
  typeRemove: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, justifyContent: 'center', alignItems: 'center' },
  typeRemoveText: { color: '#fff', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  typeAddBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  typeAddBtnText: { fontSize: 22, color: Colors.textSecondary },
  typeAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeAddInput: { width: 56, height: 48, backgroundColor: Colors.background, borderRadius: 12, textAlign: 'center', fontSize: 20, color: Colors.text, borderWidth: 1, borderColor: Colors.primary },
  typeConfirmBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  typeConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600' },
});
