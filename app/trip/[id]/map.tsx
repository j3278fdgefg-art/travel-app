import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

    if (isMobile) {
      // 手機：nmap:// 喚起 Naver Maps APP，沒裝則 fallback 網頁版
      const webUrl = `https://map.naver.com/v5/search/${encodeURIComponent(query)}`;
      window.location.href = `nmap://route/car?dname=${encodeURIComponent(query)}&appname=com.travelapp`;
      // 頁面失焦代表 APP 成功開啟，取消 fallback
      const timer = setTimeout(() => { window.open(webUrl, '_blank'); }, 1200);
      const cancel = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', cancel); };
      document.addEventListener('visibilitychange', cancel);
    } else {
      window.open(`https://map.naver.com/v5/search/${encodeURIComponent(query)}`, '_blank');
    }
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
          {/* 行程地點清單 */}
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
                    <TouchableOpacity
                      key={item.id}
                      style={styles.placeChip}
                      onPress={() => searchLocation(item.location!)}
                    >
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
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.noLocations}>行程中沒有填寫地點的項目</Text>
          )}

          {/* 分享行程地圖 */}
          <View style={styles.shareDivider} />
          <View style={styles.shareRow}>
            <View style={styles.shareInfo}>
              <Text style={styles.shareIcon}>🔗</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  style={styles.shareInput}
                  value={listUrl}
                  onChangeText={setListUrl}
                  placeholder="貼上 Google 我的地圖連結..."
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />
                <Text style={styles.shareSub}>分享行程地圖 · Google 我的地圖</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.shareSaveBtn} onPress={handleSaveUrl} disabled={savingUrl}>
              {savingUrl
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="save-outline" size={18} color="#fff" />}
            </TouchableOpacity>
            {!!listUrl && (
              <TouchableOpacity style={styles.shareOpenBtn} onPress={handleOpenList}>
                <Ionicons name="share-outline" size={18} color="#fff" />
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
  searchRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 4, marginBottom: 6, marginTop: 8 },
  searchInput: { flex: 1, height: 38, backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  searchBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  locateBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  navBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  navBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginBottom: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  navBarText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
  panel: { marginHorizontal: 12, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  panelTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  panelCount: { fontSize: 12, color: Colors.textSecondary },
  chipScroll: { maxHeight: 96 },
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
  shareDivider: { height: 1, backgroundColor: '#EFEAE0', marginVertical: 13 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  shareInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  shareIcon: { fontSize: 15 },
  shareInput: { height: 24, padding: 0, fontSize: 13, color: Colors.text },
  shareSub: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  shareSaveBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  shareOpenBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 6, backgroundColor: '#EAE7DF' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginBottom: 10, backgroundColor: Colors.primary, borderRadius: 16, height: 50, shadowColor: Colors.primaryDark, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  bottomBarIcon: { fontSize: 16 },
  bottomBarText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  bottomBarChevron: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
});
