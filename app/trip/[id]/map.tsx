import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string }>();
  const { currentTrip, items, fetchTripById, fetchItems, updateTrip } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '日本';

  const [search, setSearch] = useState(defaultQuery);
  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [listUrl, setListUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    if (id) { fetchTripById(id); fetchItems(id); }
  }, [id]);

  useEffect(() => {
    if (currentTrip?.map_list_url) setListUrl(currentTrip.map_list_url);
  }, [currentTrip?.map_list_url]);

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
        setQuery(`${lat},${lng}`);
        setSearch('目前位置');
        setMapKey((k) => k + 1);
        setLocating(false);
      },
      () => { alert('定位失敗，請確認已允許位置存取權限'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleNavigate = () => {
    const dest = encodeURIComponent(query);
    const origin = currentCoords ? encodeURIComponent(`${currentCoords.lat},${currentCoords.lng}`) : '';
    // Google Maps 官方通用網址：裝了 APP 自動喚起，沒裝開網頁版，不會跳 App Store
    const navUrl = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    window.open(navUrl, '_blank');
  };

  const handleSaveUrl = async () => {
    if (!id) return;
    setSavingUrl(true);
    await updateTrip(id, { map_list_url: listUrl } as any);
    setSavingUrl(false);
  };

  const handleOpenList = () => {
    if (listUrl) window.open(listUrl, '_blank');
  };

  const searchLocation = (loc: string) => {
    setSearch(loc); setQuery(loc); setMapKey((k) => k + 1);
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>地圖</Text>
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
          {locating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="locate" size={18} color={Colors.primary} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={handleNavigate}>
          <Ionicons name="navigate" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.listBtn, showPanel && styles.listBtnActive]}
          onPress={() => setShowPanel((v) => !v)}
        >
          <Ionicons name="list" size={18} color={showPanel ? '#fff' : Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* 導航快捷列 */}
      {query && query !== defaultQuery && (
        <TouchableOpacity style={styles.navBar} onPress={handleNavigate}>
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={styles.navBarText}>從目前位置導航到「{search}」</Text>
          <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      )}

      {/* 可收合面板 */}
      {showPanel && (
        <View style={styles.panel}>
          {/* 行程地點快速搜尋 */}
          {locationItems.length > 0 && (
            <>
              <Text style={styles.panelTitle}>📍 行程地點</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                <View style={styles.chipRow}>
                  {locationItems.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.locationChip}
                      onPress={() => searchLocation(item.location!)}
                    >
                      <Text style={styles.chipTime}>{item.time || ''}</Text>
                      <Text style={styles.chipTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.chipLoc} numberOfLines={1}>{item.location}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
          {locationItems.length === 0 && (
            <Text style={styles.noLocations}>行程中沒有填寫地點的項目</Text>
          )}

          {/* 檢視清單連結 */}
          <Text style={[styles.panelTitle, { marginTop: 12 }]}>🔗 Google 檢視清單</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              value={listUrl}
              onChangeText={setListUrl}
              placeholder="貼上 Google Maps 清單連結..."
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveUrlBtn} onPress={handleSaveUrl} disabled={savingUrl}>
              {savingUrl
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="save-outline" size={16} color="#fff" />}
            </TouchableOpacity>
            {!!listUrl && (
              <TouchableOpacity style={styles.openUrlBtn} onPress={handleOpenList}>
                <Ionicons name="open-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  searchRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 4, marginBottom: 6, marginTop: 8 },
  searchInput: { flex: 1, height: 38, backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  searchBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  locateBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  navBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  listBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  listBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  navBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginBottom: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  navBarText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
  panel: { marginHorizontal: 12, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  panelTitle: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  chipScroll: { maxHeight: 90 },
  chipRow: { flexDirection: 'row', gap: 8 },
  locationChip: { backgroundColor: Colors.background, borderRadius: 12, padding: 10, minWidth: 100, maxWidth: 140, borderWidth: 1, borderColor: Colors.border },
  chipTime: { fontSize: 10, color: Colors.primary, fontWeight: '600', marginBottom: 2 },
  chipTitle: { fontSize: 12, fontWeight: '600', color: Colors.text },
  chipLoc: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  noLocations: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
  urlRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  urlInput: { flex: 1, height: 38, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, fontSize: 13, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  saveUrlBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  openUrlBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
});
