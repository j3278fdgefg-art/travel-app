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
  isNaverMapUrl,
  isGoogleMapsUrl,
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
  const [mapSource, setMapSource] = useState<'kakao' | 'google'>('google');

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

  // 根據行程目的地自動識別並設定地圖來源
  useEffect(() => {
    if (currentTrip) {
      const dest = currentTrip.destination || '';
      const isKoreaDest = /korea|韓國|首爾|釜山|濟州|seoul|busan|jeju|仁川|incheon/i.test(dest);
      setMapSource(kakaoAppKey && isKoreaDest ? 'kakao' : 'google');
    }
  }, [currentTrip?.id, kakaoAppKey]);

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
          setMapSource('google');
        }
      } else {
        clearTimeout(timeoutId);
        setKakaoError('Kakao Maps 物件未定義');
        setMapSource('google');
      }
    };

    // 設定 5 秒逾時保護
    timeoutId = setTimeout(() => {
      if (!(window as any).kakao || !(window as any).kakao.maps || !(window as any).kakao.maps.Map) {
        setKakaoError('Kakao 地圖載入逾時，已自動切換回 Google 地圖');
        setMapSource('google');
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
        setMapSource('google');
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
      setMapSource('google');
    };

    document.head.appendChild(script);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [kakaoAppKey]);

  // 當地圖載入完成且有行程地點時，初始化 Kakao 地圖並畫標記、路徑
  useEffect(() => {
    if (!kakaoLoaded || mapSource !== 'kakao') return;

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

      // 篩選出具有經緯度的景點
      const itemsWithCoords = locationItems.map((item) => {
        const coords = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
        return { item, coords };
      }).filter(x => x.coords !== null) as Array<{ item: ItineraryItem, coords: { latitude: number, longitude: number } }>;

      let map = mapRef.current;
      if (!map) {
        let centerLat = 37.5665; // 首爾
        let centerLng = 126.9780;
        
        if (itemsWithCoords.length > 0) {
          centerLat = itemsWithCoords[0].coords.latitude;
          centerLng = itemsWithCoords[0].coords.longitude;
        } else if (currentTrip?.destination) {
          const dest = currentTrip.destination.toLowerCase();
          if (dest.includes('釜山') || dest.includes('busan')) {
            centerLat = 35.1796; centerLng = 129.0756;
          } else if (dest.includes('濟州') || dest.includes('jeju')) {
            centerLat = 33.4996; centerLng = 126.5312;
          }
        }

        const options = {
          center: new kakao.maps.LatLng(centerLat, centerLng),
          level: 5
        };
        map = new kakao.maps.Map(container, options);
        mapRef.current = map;

        // 加上縮放控制項
        const zoomControl = new kakao.maps.ZoomControl();
        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
      }

      const bounds = new kakao.maps.LatLngBounds();
      const linePath: any[] = [];

      itemsWithCoords.forEach((x, idx) => {
        const position = new kakao.maps.LatLng(x.coords.latitude, x.coords.longitude);
        bounds.extend(position);
        linePath.push(position);

        // 繪製地圖標記
        const marker = new kakao.maps.Marker({
          position,
          map,
          title: x.item.title
        });
        markersRef.current.push(marker);

        // 繪製資訊泡泡氣泡
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 10px;font-size:12px;color:#2C2C2C;font-family:sans-serif;font-weight:600;white-space:nowrap;border-radius:4px;">${idx + 1}. ${x.item.title}</div>`
        });

        kakao.maps.event.addListener(marker, 'click', () => {
          infowindow.open(map, marker);
        });
      });

      // 自動調整視野邊界
      if (itemsWithCoords.length > 1) {
        map.setBounds(bounds);
      } else if (itemsWithCoords.length === 1) {
        map.setCenter(new kakao.maps.LatLng(itemsWithCoords[0].coords.latitude, itemsWithCoords[0].coords.longitude));
      }

      // 繪製路線折線
      if (linePath.length > 1) {
        const polyline = new kakao.maps.Polyline({
          path: linePath,
          strokeWeight: 4,
          strokeColor: Colors.primary,
          strokeOpacity: 0.8,
          strokeStyle: 'solid'
        });
        polyline.setMap(map);
        polylineRef.current = polyline;
      }
    } catch (err: any) {
      console.error('Kakao Map initialization error:', err);
      setKakaoError(`地圖初始化失敗: ${err.message || err}`);
      setMapSource('google');
    }
  }, [kakaoLoaded, items, currentTrip, mapSource]);

  // 監聽外部傳入的 query (點擊景點卡片)，平滑移動定位
  useEffect(() => {
    if (!mapRef.current || !kakaoLoaded || mapSource !== 'kakao') return;
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
  }, [query, kakaoLoaded, mapSource]);

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
  // 優先解析 Google Maps 座標或 Naver 地圖連結，最後才嘗試 geocode 或退回 Naver 地圖搜尋
  const navigateTo = async (item: ItineraryItem) => {
    const place = item.location || '';
    const locationUrl = item.location_url || '';

    // 1. 優先從 location_url 或 location 提取可能包含的網址
    const url = extractUrl(locationUrl) || extractUrl(place);

    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

    // 導航跳轉 helper
    const openNaverNav = (lat: number, lng: number, name: string) => {
      if (isMobile) {
        window.location.href = `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=com.travelapp`;
        setTimeout(() => {
          window.open(`https://map.naver.com/p/search/${lat},${lng}`, '_blank');
        }, 1200);
      } else {
        window.open(`https://map.naver.com/p/search/${lat},${lng}`, '_blank');
      }
    };

    // 2. 如果是 Naver 地圖網址，直接開啟
    if (url && isNaverMapUrl(url)) {
      window.open(url, '_blank');
      return;
    }

    // 3. 如果是 Google 地圖網址，嘗試解析出經緯度座標
    if (url && isGoogleMapsUrl(url)) {
      const coords = extractCoordsFromUrl(url);
      if (coords) {
        openNaverNav(coords.latitude, coords.longitude, place || item.title);
        return;
      }
      // 沒有座標，嘗試從網址中解析出景點地名，用 Naver 地圖搜尋
      const parsed = parseGoogleMapsUrl(url);
      if (parsed && parsed.placeName && !isGoogleMapsUrl(parsed.placeName)) {
        window.open(`https://map.naver.com/p/search/${encodeURIComponent(parsed.placeName)}`, '_blank');
        return;
      }
    }

    // 4. 若 location 存放的是 Google 地圖網址，嘗試解析座標 (防呆)
    if (isGoogleMapsUrl(place)) {
      const coords = extractCoordsFromUrl(place);
      if (coords) {
        openNaverNav(coords.latitude, coords.longitude, item.title);
        return;
      }
    }

    // 5. 若為純文字或座標解析失敗，嘗試將 place 作為地名進行 geocode
    if (place && !isGoogleMapsUrl(place)) {
      const geo = await geocodePlace(place);
      if (geo) {
        openNaverNav(geo.latitude, geo.longitude, place);
        return;
      }
    }

    // 6. 退路：直接以地名在 Naver 地圖搜尋 (Naver 地圖支援中文景點，比退回 Google Maps 更好用)
    const cleanPlace = place && !isGoogleMapsUrl(place) ? place : item.title;
    window.open(`https://map.naver.com/p/search/${encodeURIComponent(cleanPlace)}`, '_blank');
  };

  // 點行程地點 → 把 Google 內嵌地圖移到該地點
  const showOnMap = (item: ItineraryItem) => {
    const mapQuery = getMapQuery(item);
    setQuery(mapQuery);
    setMapKey((k) => k + 1);
  };


  const isCoord = /^-?\d+\.\d+,-?\d+\.\d+$/.test(query);
  const mapSrc = isCoord
    ? `https://maps.google.com/maps?q=${query}&output=embed&hl=zh-TW&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=zh-TW&z=15`;

  const renderMap = () => {
    if (mapSource === 'kakao') {
      if (!kakaoLoaded) {
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[styles.centerText, { marginTop: 12 }]}>正在載入 Kakao 地圖...</Text>
          </View>
        );
      }
      return (
        <div
          id="kakao-map"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: '100%',
          }}
        />
      );
    }

    return (
      <iframe
        key={mapKey}
        ref={iframeRef}
        src={mapSrc}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allow="geolocation"
      />
    );
  };

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

      {/* 地圖來源切換頁籤 (若有設定金鑰才顯示) */}
      {!!kakaoAppKey && (
        <View style={styles.mapSourceRow}>
          <TouchableOpacity
            style={[styles.sourceTab, mapSource === 'google' && styles.sourceTabActive]}
            onPress={() => setMapSource('google')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sourceTabText, mapSource === 'google' && styles.sourceTabTextActive]}>
              🗺️ Google 地圖
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceTab, mapSource === 'kakao' && styles.sourceTabActive]}
            onPress={() => {
              if (kakaoError) {
                alert(`Kakao 地圖載入失敗：${kakaoError}`);
                return;
              }
              setMapSource('kakao');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.sourceTabText, mapSource === 'kakao' && styles.sourceTabTextActive]}>
              🇰🇷 Kakao 韓國地圖
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Kakao 載入失敗/警告提示 */}
      {!!kakaoError && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>⚠️ Kakao 地圖載入失敗 (已自動切換 Google 地圖備用)</Text>
          <Text style={styles.warningDetail}>{kakaoError}</Text>
          <Text style={[styles.warningDetail, { marginTop: 4, fontWeight: '700' }]}>
            目前使用的金鑰為: "{kakaoAppKey || '(空)'}"
          </Text>
          <Text style={styles.warningTip}>
            提示：使用 Kakao 地圖需於 Kakao Developers 註冊您的 Web 平台網域 (例如：https://travel-app-seven-chi.vercel.app)。
          </Text>
        </View>
      )}

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
        {renderMap()}
      </View>

      {/* 提示使用者設定 Kakao 金鑰 */}
      {!kakaoAppKey && (
        <TouchableOpacity style={styles.kakaoTip} onPress={() => router.push('/settings' as any)}>
          <Text style={styles.kakaoTipText}>
            💡 正在使用備用 Google 地圖。您可至「設定」填入 Kakao 金鑰，啟用精美的內嵌韓國地圖與路線畫線！
          </Text>
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
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 10, backgroundColor: '#EAE7DF', position: 'relative', minHeight: 350 },
  center: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAE7DF' },
  centerEmoji: { fontSize: 60, marginBottom: 16 },
  centerText: { fontSize: 16, color: Colors.textSecondary },
  kakaoTip: { marginHorizontal: 12, marginBottom: 10, padding: 10, backgroundColor: '#FCF9F2', borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  kakaoTipText: { fontSize: 11, color: Colors.accent, fontWeight: '500', textAlign: 'center', lineHeight: 16 },
  mapSourceRow: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 8, backgroundColor: '#EAE7DF', borderRadius: 12, padding: 3 },
  sourceTab: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  sourceTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sourceTabText: { fontSize: 13, fontWeight: '600', color: '#8A857A' },
  sourceTabTextActive: { color: Colors.primaryDark },
  warningBanner: { marginHorizontal: 12, marginBottom: 10, padding: 12, backgroundColor: '#FFF8E6', borderRadius: 12, borderWidth: 1, borderColor: '#FFE0B2' },
  warningText: { fontSize: 12, fontWeight: '700', color: '#E65100' },
  warningDetail: { fontSize: 11, color: '#D84315', marginTop: 4, fontFamily: 'monospace' },
  warningTip: { fontSize: 11, color: '#F57C00', marginTop: 6, lineHeight: 15 },
});
