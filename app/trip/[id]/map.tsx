import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { ItineraryItem } from '../../../types';
import {
  extractUrl,
  isGoogleMapsUrl,
  isKakaoMapUrl,
  extractPlaceFromKakaoUrl,
  extractCoordsFromUrl,
  parseGoogleMapsUrl,
  getMapQuery,
} from '../../../lib/mapUtils';

async function geocodePlace(name: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
    const data = await res.json();
    if (data.results?.length) {
      const r = data.results[0];
      return { latitude: r.latitude, longitude: r.longitude };
    }
  } catch {}
  return null;
}

// 由項目的 location 字串擷取可搜尋的地名/地址（去掉「[NAVER 地图]」前綴與網址）
function buildSearchQuery(item: { location?: string; title: string }): string {
  let loc = (item.location || '').trim();
  loc = loc.replace(/^\[[^\]]*\]\s*/, '');       // 去掉 [NAVER 地图] 之類前綴
  loc = loc.replace(/https?:\/\/\S+/g, '').trim(); // 去掉網址
  loc = loc.replace(/[，,]\s*$/, '').trim();
  return loc || item.title;
}

// Kakao 地點關鍵字搜尋 → 座標
function kakaoKeywordSearch(kakao: any, query: string): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!query || !kakao?.maps?.services?.Places) return resolve(null);
    try {
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(query, (data: any, status: any) => {
        if (status === kakao.maps.services.Status.OK && data?.[0]) {
          resolve({ latitude: parseFloat(data[0].y), longitude: parseFloat(data[0].x) });
        } else resolve(null);
      });
    } catch { resolve(null); }
  });
}

// 把一個行程項目解析成座標：URL 座標 → Kakao 關鍵字搜尋 → open-meteo 退路
async function resolveItemCoords(item: ItineraryItem, kakao: any): Promise<{ latitude: number; longitude: number } | null> {
  const fromUrl = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
  if (fromUrl) return fromUrl;
  const cleaned = buildSearchQuery(item);
  for (const q of [cleaned, item.title].filter(Boolean)) {
    const hit = await kakaoKeywordSearch(kakao, q);
    if (hit) return hit;
  }
  return geocodePlace(cleaned);
}

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
  const router = useRouter();
  const { currentTrip, items, fetchTripById, fetchItems } = useTripStore();
  const { kakaoAppKey } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '日本';

  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  const [kakaoLoaded, setKakaoLoaded] = useState(false);
  const [kakaoError, setKakaoError] = useState<string | null>(null);

  // 行程地點：取有填 location 的行程項目
  const locationItems = items.filter((item) => item.location?.trim());

  useEffect(() => {
    if (id) { fetchTripById(id); fetchItems(id); }
  }, [id]);

  useEffect(() => {
    if (params.q) {
      const q = decodeURIComponent(params.q as string);
      setQuery(q); setMapKey((k) => k + 1);
    }
  }, [params.q]);

  // 當行程資料載入後，若 query 還在預設值則同步更新為目的地
  useEffect(() => {
    if (currentTrip && !params.q && (query === '日本' || !query)) {
      const dest = currentTrip.destination || currentTrip.name || '';
      if (dest) setQuery(dest);
    }
  }, [currentTrip, params.q]);

  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  // 動態載入 Kakao Maps SDK 腳本
  useEffect(() => {
    if (Platform.OS !== 'web' || !kakaoAppKey) {
      setKakaoLoaded(false);
      return;
    }

    let timeoutId: any;
    setKakaoError(null);

    const initializeKakao = () => {
      const kakao = (window as any).kakao;
      if (kakao && kakao.maps) {
        try {
          kakao.maps.load(() => {
            clearTimeout(timeoutId);
            setKakaoLoaded(true);
            setKakaoError(null);
          });
        } catch (err: any) {
          clearTimeout(timeoutId);
          setKakaoError(err.message || 'Kakao Maps 載入失敗');
        }
      } else {
        clearTimeout(timeoutId);
        setKakaoError('Kakao Maps 物件未定義');
      }
    };

    // 設定 5 秒逾時保護
    timeoutId = setTimeout(() => {
      if (!(window as any).kakao || !(window as any).kakao.maps || !(window as any).kakao.maps.Map) {
        setKakaoError('Kakao 地圖載入逾時');
      }
    }, 5000);

    // 1. 如果 Map 建構子已經存在，代表完全載入成功
    if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.Map) {
      clearTimeout(timeoutId);
      setKakaoLoaded(true);
      return;
    }

    // 2. 如果 window.kakao 存在但尚未 load，直接執行載入
    if ((window as any).kakao && (window as any).kakao.maps) {
      initializeKakao();
      return;
    }

    // 3. 如果 script 已經存在，等待其 onload 觸發
    const existingScript = document.getElementById('kakao-maps-sdk') as HTMLScriptElement;
    if (existingScript) {
      const handleScriptLoad = () => {
        initializeKakao();
      };
      const handleScriptError = () => {
        clearTimeout(timeoutId);
        setKakaoError('Kakao SDK 載入錯誤 (可能是金鑰無效或被封鎖)');
      };
      existingScript.addEventListener('load', handleScriptLoad);
      existingScript.addEventListener('error', handleScriptError);
      return () => {
        existingScript.removeEventListener('load', handleScriptLoad);
        existingScript.removeEventListener('error', handleScriptError);
        clearTimeout(timeoutId);
      };
    }

    // 4. 否則建立新的 script 標籤
    const script = document.createElement('script');
    script.id = 'kakao-maps-sdk';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoAppKey}&autoload=false&libraries=services`;
    script.async = true;
    script.referrerPolicy = 'no-referrer-when-downgrade';

    script.onload = () => {
      initializeKakao();
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      setKakaoError('Kakao SDK 載入失敗 (可能是金鑰無效或網域未授權)');
    };

    document.head.appendChild(script);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [kakaoAppKey]);

  // 當地圖載入完成且有行程地點時，初始化 Kakao 地圖並畫標記、路徑
  useEffect(() => {
    if (!kakaoLoaded) return;

    try {
      const kakao = (window as any).kakao;
      const container = document.getElementById('kakao-map');
      if (!container) return;

      // 清除舊的標記與折線，避免資料重疊
      if (markersRef.current.length > 0) {
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
      }
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }

      let map = mapRef.current;
      // 若 div 是全新空白（剛從 Google 切回），舊 map 已綁定消失的 DOM，需重建
      if (!map || !container.firstChild) {
        mapRef.current = null;
        let centerLat = 37.5665; // 首爾
        let centerLng = 126.9780;
        if (currentTrip?.destination) {
          const dest = currentTrip.destination.toLowerCase();
          if (dest.includes('釜山') || dest.includes('busan')) {
            centerLat = 35.1796; centerLng = 129.0756;
          } else if (dest.includes('濟州') || dest.includes('jeju')) {
            centerLat = 33.4996; centerLng = 126.5312;
          }
        }
        map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(centerLat, centerLng), level: 6 });
        mapRef.current = map;
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      }

      // 以 Kakao 關鍵字搜尋把每個地點轉成座標，再畫標記與路線
      (async () => {
        const resolved: Array<{ item: ItineraryItem; lat: number; lng: number }> = [];
        for (const item of locationItems) {
          const coords = await resolveItemCoords(item, kakao);
          if (coords) resolved.push({ item, lat: coords.latitude, lng: coords.longitude });
        }
        if (mapRef.current !== map) return; // 地圖已重建，放棄這批

        const bounds = new kakao.maps.LatLngBounds();
        const linePath: any[] = [];
        resolved.forEach(({ item, lat, lng }, idx) => {
          const position = new kakao.maps.LatLng(lat, lng);
          bounds.extend(position);
          linePath.push(position);
          const marker = new kakao.maps.Marker({ position, map, title: item.title });
          markersRef.current.push(marker);
          const infowindow = new kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:12px;color:#2C2C2C;font-family:sans-serif;font-weight:600;white-space:nowrap;border-radius:4px;">${idx + 1}. ${item.title}</div>`,
          });
          kakao.maps.event.addListener(marker, 'click', () => infowindow.open(map, marker));
        });

        if (resolved.length > 1) map.setBounds(bounds);
        else if (resolved.length === 1) map.setCenter(new kakao.maps.LatLng(resolved[0].lat, resolved[0].lng));

        if (linePath.length > 1) {
          const polyline = new kakao.maps.Polyline({
            path: linePath, strokeWeight: 4, strokeColor: Colors.primary, strokeOpacity: 0.8, strokeStyle: 'solid',
          });
          polyline.setMap(map);
          polylineRef.current = polyline;
        }
      })();
    } catch (err: any) {
      console.error('Kakao Map initialization error:', err);
      setKakaoError(`地圖初始化失敗: ${err.message || err}`);
    }
  }, [kakaoLoaded, items, currentTrip]);

  // 監聽外部傳入的 query (點擊景點卡片)，平滑移動定位
  useEffect(() => {
    if (!mapRef.current || !kakaoLoaded) return;
    try {
      const kakao = (window as any).kakao;
      const isCoord = /^-?\d+\.\d+,-?\d+\.\d+$/.test(query);

      if (isCoord) {
        const [lat, lng] = query.split(',').map(parseFloat);
        const position = new kakao.maps.LatLng(lat, lng);
        mapRef.current.panTo(position);
        mapRef.current.setLevel(3);
      } else if (query && query !== '日本') {
        const tryGeocodeFallback = () => {
          geocodePlace(query).then((geo) => {
            if (geo && mapRef.current) {
              mapRef.current.panTo(new kakao.maps.LatLng(geo.latitude, geo.longitude));
              mapRef.current.setLevel(5);
            }
          });
        };

        if (kakao.maps.services?.Places) {
          const ps = new kakao.maps.services.Places();
          ps.keywordSearch(query, (data: any, status: any) => {
            if (status === kakao.maps.services.Status.OK && mapRef.current) {
              mapRef.current.panTo(new kakao.maps.LatLng(data[0].y, data[0].x));
              mapRef.current.setLevel(4);
            } else {
              tryGeocodeFallback();
            }
          });
        } else {
          tryGeocodeFallback();
        }
      }
    } catch (err) {
      console.error('Kakao Map pan error:', err);
    }
  }, [query, kakaoLoaded]);

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

  // 跳轉 Kakao 地圖導航到指定地點
  const navigateTo = async (item: ItineraryItem) => {
    const place = item.location || '';
    const locationUrl = item.location_url || '';
    const url = extractUrl(locationUrl) || extractUrl(place);
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

    const openKakaoNav = (lat: number, lng: number, name: string) => {
      const encodedName = encodeURIComponent(name);
      if (isMobile) {
        window.location.href = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
        setTimeout(() => {
          window.open(`https://map.kakao.com/link/to/${encodedName},${lat},${lng}`, '_blank');
        }, 1200);
      } else {
        window.open(`https://map.kakao.com/link/to/${encodedName},${lat},${lng}`, '_blank');
      }
    };

    // 1. Kakao 地圖網址，直接開啟
    if (url && isKakaoMapUrl(url)) {
      window.open(url, '_blank');
      return;
    }

    // 2. Google 地圖網址，解析座標後用 Kakao 導航
    if (url && isGoogleMapsUrl(url)) {
      const coords = extractCoordsFromUrl(url);
      if (coords) {
        openKakaoNav(coords.latitude, coords.longitude, place || item.title);
        return;
      }
      const parsed = parseGoogleMapsUrl(url);
      if (parsed?.placeName && !isGoogleMapsUrl(parsed.placeName)) {
        const geo = await geocodePlace(parsed.placeName);
        if (geo) { openKakaoNav(geo.latitude, geo.longitude, parsed.placeName); return; }
      }
    }

    // 3. location 本身是 Google 地圖網址
    if (isGoogleMapsUrl(place)) {
      const coords = extractCoordsFromUrl(place);
      if (coords) { openKakaoNav(coords.latitude, coords.longitude, item.title); return; }
    }

    // 4. 純文字地名 → geocode → Kakao 導航
    const textQuery = place && !isGoogleMapsUrl(place) && !isKakaoMapUrl(place) ? place : item.title;
    const geo = await geocodePlace(textQuery);
    if (geo) {
      openKakaoNav(geo.latitude, geo.longitude, textQuery);
      return;
    }

    // 5. 退路：Kakao 地圖搜尋
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(textQuery)}`, '_blank');
  };

  // 點行程地點 → 同步更新兩個地圖
  const showOnMap = (item: ItineraryItem) => {
    const place = item.location || '';
    const url = item.location_url || '';
    // 若 location 或 location_url 是 Kakao 網址，提取地名作為查詢
    if (isKakaoMapUrl(place)) {
      const name = extractPlaceFromKakaoUrl(place) || item.title;
      setQuery(name); setMapKey((k) => k + 1); return;
    }
    if (isKakaoMapUrl(url)) {
      const name = extractPlaceFromKakaoUrl(url) || item.title;
      setQuery(name); setMapKey((k) => k + 1); return;
    }
    let mapQuery = getMapQuery(item);
    // NAVER 格式（[NAVER 地图] … 網址）會回傳整串，清理成可搜尋的地名
    if (/^\[/.test(mapQuery) || /https?:\/\//.test(mapQuery)) {
      mapQuery = buildSearchQuery(item);
    }
    setQuery(mapQuery);
    setMapKey((k) => k + 1);
  };


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

      {/* 上排：顯示/隱藏行程地點 + 定位 */}
      <View style={styles.topRow}>
        {locationItems.length > 0 ? (
          <TouchableOpacity style={styles.listToggle} onPress={() => setShowPanel((v) => !v)} activeOpacity={0.85}>
            <Text style={styles.listToggleIcon}>📋</Text>
            <Text style={styles.listToggleText}>
              {showPanel ? '隱藏顯示地點' : `顯示行程地點（${locationItems.length}）`}
            </Text>
            <Text style={styles.listToggleChevron}>{showPanel ? '▴' : '▾'}</Text>
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocate} disabled={locating}>
          {locating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={styles.ctrlEmoji}>📍</Text>}
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
                      <TouchableOpacity activeOpacity={0.7} onPress={() => showOnMap(item)}>
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
                      <TouchableOpacity style={styles.placeNavBtn} onPress={() => navigateTo(item)}>
                        <Text style={styles.placeNavText}>🧭 Kakao 導航</Text>
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

      {/* 地圖：左 Kakao、右 Google 並排 */}
      <View style={styles.mapContainer}>
        {/* 左：Kakao 地圖 */}
        <View style={styles.mapHalf}>
          {!kakaoAppKey ? (
            <View style={styles.center}>
              <Text style={styles.centerEmoji}>🗺️</Text>
              <Text style={styles.centerText}>Kakao 地圖</Text>
              <TouchableOpacity onPress={() => router.push('/settings' as any)}>
                <Text style={[styles.centerText, { fontSize: 12, marginTop: 6, color: Colors.primary }]}>
                  前往設定輸入 API Key
                </Text>
              </TouchableOpacity>
            </View>
          ) : kakaoError ? (
            <View style={styles.center}>
              <Text style={styles.centerEmoji}>⚠️</Text>
              <Text style={[styles.centerText, { fontSize: 12, textAlign: 'center', paddingHorizontal: 16 }]}>{kakaoError}</Text>
            </View>
          ) : !kakaoLoaded ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.centerText, { marginTop: 12 }]}>載入 Kakao...</Text>
            </View>
          ) : (
            <div id="kakao-map" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
          )}
          <View style={styles.mapLabel}><Text style={styles.mapLabelText}>🇰🇷 Kakao</Text></View>
        </View>

        {/* 分隔線 */}
        <View style={styles.mapDivider} />

        {/* 右：Google 地圖 */}
        <View style={styles.mapHalf}>
          <iframe
            key={mapKey}
            ref={iframeRef}
            src={mapSrc}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allow="geolocation"
          />
          <View style={styles.mapLabel}><Text style={styles.mapLabelText}>🗺️ Google</Text></View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  ctrlEmoji: { fontSize: 17 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  listToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: Colors.primary, shadowColor: Colors.primaryDark, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  listToggleIcon: { fontSize: 15 },
  listToggleText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  listToggleChevron: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  locateBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
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
  mapContainer: { flex: 1, flexDirection: 'row', marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 10, backgroundColor: '#EAE7DF', minHeight: 350 },
  mapHalf: { flex: 1, position: 'relative' },
  mapDivider: { width: 2, backgroundColor: Colors.border },
  mapLabel: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, zIndex: 10 },
  mapLabelText: { fontSize: 11, fontWeight: '700', color: Colors.text },
  center: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAE7DF' },
  centerEmoji: { fontSize: 48, marginBottom: 12 },
  centerText: { fontSize: 14, color: Colors.textSecondary },
});
