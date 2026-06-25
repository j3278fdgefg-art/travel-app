import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  transport: { emoji: '🚃', label: '交通' },
  accommodation: { emoji: '🏨', label: '住宿' },
  food: { emoji: '🍽️', label: '美食' },
  attraction: { emoji: '🏞️', label: '景點' },
  other: { emoji: '📍', label: '地點' },
};
const typeMeta = (t?: string) => TYPE_META[t || 'other'] || { emoji: t || '📍', label: '地點' };

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string }>();
  const { currentTrip, items, fetchTripById, fetchItems } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '日本';

  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    if (id) { fetchTripById(id); fetchItems(id); }
  }, [id]);

  useEffect(() => {
    if (params.q) {
      const q = decodeURIComponent(params.q as string);
      setQuery(q); setMapKey((k) => k + 1);
    }
  }, [params.q]);

  const handleLocate = () => {
    if (!navigator.geolocation) return alert('瀏覽器不支援定位');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setQuery(`${lat},${lng}`);
        setMapKey((k) => k + 1);
        setLocating(false);
      },
      () => { alert('定位失敗，請確認已允許位置存取權限'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 跳轉 Naver 地圖導航到指定地點
  const navigateTo = (place: string) => {
    if (!place) return;
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const webUrl = `https://map.naver.com/v5/search/${encodeURIComponent(place)}`;
    if (isMobile) {
      window.location.href = `nmap://search?query=${encodeURIComponent(place)}&appname=com.travelapp`;
      setTimeout(() => { window.open(webUrl, '_blank'); }, 1200);
    } else {
      window.open(webUrl, '_blank');
    }
  };

  // 點行程地點 → 把 Google 內嵌地圖移到該地點
  const showOnMap = (loc: string) => {
    setQuery(loc); setMapKey((k) => k + 1);
  };

  // 行程地點：取有填 location 的行程項目
  const locationItems = items.filter((item) => item.location?.trim());

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
      <View style={{ height: 12 }} />

      {/* 定位列 */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.locateWide} onPress={handleLocate} disabled={locating}>
          {locating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={styles.ctrlEmoji}>📍</Text>}
          <Text style={styles.locateText}>{locating ? '定位中…' : '定位目前位置'}</Text>
        </TouchableOpacity>
      </View>

      {/* 行程地點面板 */}
      {showPanel && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>📍 行程地點</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.panelCount}>共 {locationItems.length} 個</Text>
          </View>
          {locationItems.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <View style={styles.chipRow}>
                {locationItems.map((item, idx) => {
                  const meta = typeMeta(item.type);
                  return (
                    <View key={item.id} style={styles.placeChip}>
                      <TouchableOpacity activeOpacity={0.7} onPress={() => showOnMap(item.location!)}>
                        <View style={styles.placeChipTop}>
                          <View style={styles.placeNum}><Text style={styles.placeNumText}>{idx + 1}</Text></View>
                          {!!item.time && <Text style={styles.placeTime}>{item.time}</Text>}
                        </View>
                        <Text style={styles.placeName} numberOfLines={1}>{item.title}</Text>
                        <View style={styles.placeCatRow}>
                          <Text style={{ fontSize: 11 }}>{meta.emoji}</Text>
                          <Text style={styles.placeCat} numberOfLines={1}>{meta.label}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.placeNavBtn} onPress={() => navigateTo(item.location!)}>
                        <Text style={styles.placeNavText}>🧭 Naver 導航</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.noLocations}>行程中沒有填寫地點的項目</Text>
          )}
        </View>
      )}

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

      {/* 底部：顯示/收合行程地點 */}
      {locationItems.length > 0 && (
        <TouchableOpacity style={styles.bottomBar} onPress={() => setShowPanel((v) => !v)} activeOpacity={0.85}>
          <Text style={styles.bottomBarIcon}>📋</Text>
          <Text style={styles.bottomBarText}>
            {showPanel ? '收合清單' : `顯示行程地點（${locationItems.length}）`}
          </Text>
          <Text style={styles.bottomBarChevron}>{showPanel ? '▾' : '▴'}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  ctrlEmoji: { fontSize: 17 },
  topRow: { paddingHorizontal: 12, marginBottom: 8 },
  locateWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  locateText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  panel: { marginHorizontal: 12, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  panelTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  panelCount: { fontSize: 12, color: Colors.textSecondary },
  chipScroll: { maxHeight: 150 },
  chipRow: { flexDirection: 'row', gap: 9 },
  placeChip: { width: 150, backgroundColor: '#F7F5EF', borderRadius: 13, padding: 11, borderWidth: 1.5, borderColor: Colors.border },
  placeChipTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeNum: { width: 20, height: 20, borderRadius: 6, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  placeNumText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  placeTime: { fontSize: 11, fontWeight: '700', color: Colors.primaryDark },
  placeName: { fontSize: 14, fontWeight: '600', color: Colors.text, marginTop: 8 },
  placeCatRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  placeCat: { fontSize: 11, color: Colors.textSecondary },
  noLocations: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
  placeNavBtn: { marginTop: 9, backgroundColor: Colors.primary, borderRadius: 9, paddingVertical: 7, alignItems: 'center' },
  placeNavText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 6, backgroundColor: '#EAE7DF' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginBottom: 10, backgroundColor: Colors.primary, borderRadius: 16, height: 50, shadowColor: Colors.primaryDark, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  bottomBarIcon: { fontSize: 16 },
  bottomBarText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  bottomBarChevron: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
});
