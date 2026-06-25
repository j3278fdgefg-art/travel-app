import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';

const NAVER_CLIENT_ID: string = (Constants.expoConfig?.extra as any)?.naverMapClientId || '';

// 載入 Naver Maps JS SDK（只載入一次）
let naverScriptPromise: Promise<void> | null = null;
function loadNaverMaps(clientId: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('no-dom'));
  if ((window as any).naver?.maps) return Promise.resolve();
  if (naverScriptPromise) return naverScriptPromise;
  naverScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { naverScriptPromise = null; reject(new Error('naver-load-failed')); };
    document.head.appendChild(script);
  });
  return naverScriptPromise;
}

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string }>();
  const { currentTrip, items, fetchTripById, fetchItems, updateTrip } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const mapElRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '日本';

  const [search, setSearch] = useState(defaultQuery);
  const [query, setQuery] = useState(defaultQuery);
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
      setSearch(q); setQuery(q);
    }
  }, [params.q]);

  // 載入 Naver Maps SDK（web + 有金鑰時）
  useEffect(() => {
    if (Platform.OS !== 'web' || !NAVER_CLIENT_ID) return;
    loadNaverMaps(NAVER_CLIENT_ID).then(() => setSdkReady(true)).catch(() => setSdkError(true));
  }, []);

  // 建立地圖實例
  useEffect(() => {
    if (!sdkReady || !mapElRef.current || mapInstanceRef.current) return;
    const naver = (window as any).naver;
    const center = new naver.maps.LatLng(35.1796, 129.0756); // 釜山預設中心
    mapInstanceRef.current = new naver.maps.Map(mapElRef.current, { center, zoom: 13 });
    markerRef.current = new naver.maps.Marker({ position: center, map: mapInstanceRef.current });
  }, [sdkReady]);

  // 依 query 更新地圖中心與標記
  useEffect(() => {
    if (!sdkReady || !mapInstanceRef.current || !query) return;
    const naver = (window as any).naver;
    const setPoint = (lat: number, lng: number) => {
      const p = new naver.maps.LatLng(lat, lng);
      mapInstanceRef.current.setCenter(p);
      mapInstanceRef.current.setZoom(15);
      markerRef.current?.setPosition(p);
    };
    const coordMatch = query.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    if (coordMatch) {
      setPoint(Number(coordMatch[1]), Number(coordMatch[2]));
      return;
    }
    if (!naver.maps.Service) return;
    naver.maps.Service.geocode({ query }, (status: any, response: any) => {
      if (status !== naver.maps.Service.Status.OK) return;
      const addr = response.v2?.addresses?.[0];
      if (addr) setPoint(Number(addr.y), Number(addr.x));
    });
  }, [query, sdkReady]);

  const handleSearch = () => {
    if (search.trim()) setQuery(search.trim());
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
    setSearch(loc); setQuery(loc);
  };

  // 行程地點：取有填 location 的行程項目
  const locationItems = items.filter((item) => item.location?.trim());

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
        {!NAVER_CLIENT_ID ? (
          <View style={styles.mapFallback}>
            <Text style={styles.centerEmoji}>🗺️</Text>
            <Text style={styles.fallbackTitle}>尚未設定 Naver 地圖金鑰</Text>
            <Text style={styles.fallbackText}>
              在 app.json 的 extra.naverMapClientId 填入{'\n'}NAVER Cloud Platform 的 Maps Client ID 即可顯示地圖
            </Text>
            <TouchableOpacity style={styles.fallbackBtn} onPress={handleNavigate}>
              <Ionicons name="open-outline" size={16} color="#fff" />
              <Text style={styles.fallbackBtnText}>在 Naver 地圖開啟「{search}」</Text>
            </TouchableOpacity>
          </View>
        ) : sdkError ? (
          <View style={styles.mapFallback}>
            <Text style={styles.centerEmoji}>⚠️</Text>
            <Text style={styles.fallbackTitle}>地圖載入失敗</Text>
            <Text style={styles.fallbackText}>請確認 Naver Maps Client ID 是否正確、網域是否已加入白名單</Text>
            <TouchableOpacity style={styles.fallbackBtn} onPress={handleNavigate}>
              <Ionicons name="open-outline" size={16} color="#fff" />
              <Text style={styles.fallbackBtnText}>在 Naver 地圖開啟「{search}」</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
        )}
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
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 6, backgroundColor: '#EAE7DF' },
  mapFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fallbackTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, marginTop: 8 },
  fallbackText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  fallbackBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
});
