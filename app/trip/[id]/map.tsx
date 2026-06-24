import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Platform, ActivityIndicator } from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string }>();
  const { currentTrip } = useTripStore();
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '日本';

  const [search, setSearch] = useState(defaultQuery);
  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (params.q) {
      const q = decodeURIComponent(params.q as string);
      setSearch(q); setQuery(q); setMapKey((k) => k + 1);
    }
  }, [params.q]);

  const handleSearch = () => {
    if (search.trim()) { setQuery(search.trim()); setMapKey((k) => k + 1); }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return alert('瀏覽器不支援定位');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCurrentCoords({ lat, lng });
        const locQuery = `${lat},${lng}`;
        setQuery(locQuery);
        setSearch('目前位置');
        setMapKey((k) => k + 1);
        setLocating(false);
      },
      () => { alert('定位失敗，請確認已允許位置存取權限'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleNavigate = () => {
    // 在新分頁開啟 Google Maps 導航（瀏覽器版，不跳 App）
    const dest = encodeURIComponent(query);
    const navUrl = currentCoords
      ? `https://www.google.com/maps/dir/${currentCoords.lat},${currentCoords.lng}/${dest}`
      : `https://www.google.com/maps/dir//${dest}`;
    window.open(navUrl, '_blank');
  };

  // 使用完整 Google Maps embed（會沿用瀏覽器 Google 帳號，支援點擊地點顯示資訊）
  const isCoord = /^-?\d+\.\d+,-?\d+\.\d+$/.test(query);
  const mapSrc = isCoord
    ? `https://maps.google.com/maps?q=${query}&output=embed&hl=zh-TW&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=zh-TW&z=15`;

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.centerEmoji}>🗺️</Text>
          <Text style={styles.centerText}>地圖功能目前僅支援網頁版</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>地圖</Text>
        {query !== defaultQuery && <Text style={styles.headerSub}>📍 {search}</Text>}
      </View>

      {/* 搜尋列 */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="搜尋景點、地址..."
          placeholderTextColor={Colors.textLight}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Ionicons name="search" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocate} disabled={locating}>
          {locating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="locate" size={18} color={Colors.primary} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={handleNavigate}>
          <Ionicons name="navigate" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 功能提示 */}
      <View style={styles.tipsRow}>
        <Text style={styles.tip}>📍 點地圖地標查看資訊</Text>
        <Text style={styles.tip}>🧭 導航開新分頁</Text>
        <Text style={styles.tip}>❤️ 喜愛點需登入 Google</Text>
      </View>

      {/* 地圖 */}
      <View style={styles.mapContainer}>
        <iframe
          key={mapKey}
          ref={iframeRef}
          src={mapSrc}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="geolocation"
        />
      </View>

      <Text style={styles.hint}>
        💡 地圖點擊地標後，資訊卡會在地圖內顯示。若已在瀏覽器登入 Google，喜愛清單會自動同步。
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 6, marginTop: 8 },
  searchInput: { flex: 1, height: 42, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  searchBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  locateBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  navBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  tipsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, marginBottom: 6 },
  tip: { fontSize: 10, color: Colors.textSecondary },
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 6 },
  hint: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', paddingBottom: 8, paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
});
