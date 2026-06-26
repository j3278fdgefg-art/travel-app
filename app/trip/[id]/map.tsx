import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { ItineraryItem } from '../../../types';
import { extractUrl, isGoogleMapsUrl, extractCoordsFromUrl } from '../../../lib/mapUtils';

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  transport: { emoji: '🚃', label: '交通' },
  accommodation: { emoji: '🏨', label: '住宿' },
  food: { emoji: '🍽️', label: '美食' },
  attraction: { emoji: '🏞️', label: '景點' },
  other: { emoji: '📍', label: '地點' },
};
const typeMeta = (t?: string) => TYPE_META[t || 'other'] || { emoji: t || '📍', label: '地點' };

// 由 location 字串擷取可搜尋的地名/地址（去掉「[NAVER 地图]」前綴與網址）
function buildSearchQuery(item: { location?: string; title: string }): string {
  let loc = (item.location || '').trim();
  loc = loc.replace(/^\[[^\]]*\]\s*/, '');
  loc = loc.replace(/https?:\/\/\S+/g, '').trim();
  loc = loc.replace(/[，,]\s*$/, '').trim();
  return loc || item.title;
}

// 載入 Google Maps JS API（只載一次）
let googleScriptPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('no-dom'));
  if ((window as any).google?.maps) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const cbName = '__gmapsCb';
    (window as any)[cbName] = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=zh-TW&callback=${cbName}`;
    s.async = true;
    s.onerror = () => { googleScriptPromise = null; reject(new Error('google-load-failed')); };
    document.head.appendChild(s);
  });
  return googleScriptPromise;
}

// Google 地點文字搜尋 → 座標
function googleTextSearch(service: any, query: string): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!query || !service) return resolve(null);
    try {
      service.textSearch({ query }, (results: any, status: any) => {
        const g = (window as any).google;
        if (status === g.maps.places.PlacesServiceStatus.OK && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          resolve({ latitude: loc.lat(), longitude: loc.lng() });
        } else resolve(null);
      });
    } catch { resolve(null); }
  });
}

async function resolveItemCoords(item: ItineraryItem, service: any): Promise<{ latitude: number; longitude: number } | null> {
  const fromUrl = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
  if (fromUrl) return fromUrl;
  for (const q of [buildSearchQuery(item), item.title].filter(Boolean)) {
    const hit = await googleTextSearch(service, q);
    if (hit) return hit;
  }
  return null;
}

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string }>();
  const { currentTrip, items, fetchTripById, fetchItems } = useTripStore();
  const { googleMapsApiKey } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '釜山';

  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [gLoaded, setGLoaded] = useState(false);
  const [gError, setGError] = useState(false);

  const mapElRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const placesRef = useRef<any>(null);

  const locationItems = items.filter((item) => item.location?.trim());

  useEffect(() => {
    if (id) { fetchTripById(id); fetchItems(id); }
  }, [id]);

  useEffect(() => {
    if (params.q) { setQuery(decodeURIComponent(params.q as string)); setMapKey((k) => k + 1); }
  }, [params.q]);

  useEffect(() => {
    if (currentTrip && !params.q && (query === '釜山' || !query)) {
      const dest = currentTrip.destination || currentTrip.name || '';
      if (dest) setQuery(dest);
    }
  }, [currentTrip, params.q]);

  // 載入 Google Maps SDK
  useEffect(() => {
    if (Platform.OS !== 'web' || !googleMapsApiKey) { setGLoaded(false); return; }
    setGError(false);
    loadGoogleMaps(googleMapsApiKey).then(() => setGLoaded(true)).catch(() => setGError(true));
  }, [googleMapsApiKey]);

  // 建立地圖、標記、路線
  useEffect(() => {
    if (!gLoaded || !mapElRef.current) return;
    const google = (window as any).google;
    try {
      let centerLat = 35.1796, centerLng = 129.0756; // 釜山
      const dest = (currentTrip?.destination || '').toLowerCase();
      if (dest.includes('首爾') || dest.includes('seoul')) { centerLat = 37.5665; centerLng = 126.9780; }
      else if (dest.includes('濟州') || dest.includes('jeju')) { centerLat = 33.4996; centerLng = 126.5312; }

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(mapElRef.current, {
          center: { lat: centerLat, lng: centerLng }, zoom: 12,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        });
        placesRef.current = new google.maps.places.PlacesService(mapRef.current);
      }
      const map = mapRef.current;

      // 清除舊標記/路線
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

      (async () => {
        const resolved: Array<{ item: ItineraryItem; lat: number; lng: number }> = [];
        for (const item of locationItems) {
          const c = await resolveItemCoords(item, placesRef.current);
          if (c) resolved.push({ item, lat: c.latitude, lng: c.longitude });
        }
        if (mapRef.current !== map) return;

        const bounds = new google.maps.LatLngBounds();
        const path: any[] = [];
        const infowindow = new google.maps.InfoWindow();
        resolved.forEach(({ item, lat, lng }, idx) => {
          const position = { lat, lng };
          bounds.extend(position);
          path.push(position);
          const marker = new google.maps.Marker({
            position, map, label: { text: String(idx + 1), color: '#fff', fontSize: '12px', fontWeight: '700' },
            title: item.title,
          });
          marker.addListener('click', () => {
            infowindow.setContent(`<div style="font-size:13px;font-weight:600;color:#2C2C2C;padding:2px 4px;">${idx + 1}. ${item.title}</div>`);
            infowindow.open(map, marker);
          });
          markersRef.current.push(marker);
        });

        if (resolved.length > 1) {
          map.fitBounds(bounds);
          polylineRef.current = new google.maps.Polyline({
            path, map, strokeColor: Colors.primary, strokeOpacity: 0.85, strokeWeight: 4,
          });
        } else if (resolved.length === 1) {
          map.setCenter(path[0]); map.setZoom(15);
        }
      })();
    } catch {
      setGError(true);
    }
  }, [gLoaded, items, currentTrip]);

  // query 改變 → 平移地圖（點地點卡片 / 定位）
  useEffect(() => {
    if (!gLoaded || !mapRef.current) return;
    const google = (window as any).google;
    const coordMatch = query.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    if (coordMatch) {
      const p = { lat: Number(coordMatch[1]), lng: Number(coordMatch[2]) };
      mapRef.current.panTo(p); mapRef.current.setZoom(16); return;
    }
    if (query && query !== defaultQuery && placesRef.current) {
      googleTextSearch(placesRef.current, query).then((c) => {
        if (c && mapRef.current) {
          mapRef.current.panTo({ lat: c.latitude, lng: c.longitude });
          mapRef.current.setZoom(16);
        }
      });
    }
  }, [query, gLoaded]);

  const handleLocate = () => {
    if (!navigator.geolocation) return alert('瀏覽器不支援定位');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setQuery(`${pos.coords.latitude},${pos.coords.longitude}`); setMapKey((k) => k + 1); setLocating(false); },
      () => { alert('定位失敗，請確認已允許位置存取權限'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Google 地圖導航
  const navigateTo = (item: ItineraryItem) => {
    const url = extractUrl(item.location_url || '') || extractUrl(item.location || '');
    if (url && isGoogleMapsUrl(url)) { window.open(url, '_blank'); return; }
    const coords = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
    const dest = coords ? `${coords.latitude},${coords.longitude}` : buildSearchQuery(item);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
  };

  // 點地點卡片 → 地圖移過去
  const showOnMap = (item: ItineraryItem) => {
    const coords = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
    setQuery(coords ? `${coords.latitude},${coords.longitude}` : buildSearchQuery(item));
    setMapKey((k) => k + 1);
  };

  const isCoord = /^-?\d+\.\d+,-?\d+\.\d+$/.test(query);
  const mapSrc = isCoord
    ? `https://maps.google.com/maps?q=${query}&output=embed&hl=zh-TW&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=zh-TW&z=15`;

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text style={styles.centerEmoji}>🗺️</Text><Text style={styles.centerText}>地圖功能目前僅支援網頁版</Text></View>
      </SafeAreaView>
    );
  }

  const useFullMap = !!googleMapsApiKey && !gError;

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ height: 12 }} />

      {/* 上排：顯示/隱藏行程地點 + 定位 */}
      <View style={styles.topRow}>
        {locationItems.length > 0 ? (
          <TouchableOpacity style={styles.listToggle} onPress={() => setShowPanel((v) => !v)} activeOpacity={0.85}>
            <Text style={styles.listToggleIcon}>📋</Text>
            <Text style={styles.listToggleText}>{showPanel ? '隱藏顯示地點' : `顯示行程地點（${locationItems.length}）`}</Text>
            <Text style={styles.listToggleChevron}>{showPanel ? '▴' : '▾'}</Text>
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocate} disabled={locating}>
          {locating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.ctrlEmoji}>📍</Text>}
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
                        <Text style={styles.placeNavText}>🧭 Google 導航</Text>
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
        {useFullMap ? (
          !gLoaded ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.centerText, { marginTop: 12 }]}>載入 Google 地圖…</Text>
            </View>
          ) : (
            <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
          )
        ) : (
          <>
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
            {gError && (
              <View style={styles.keyHint}>
                <Text style={styles.keyHintText}>⚠️ Google 地圖載入失敗，顯示基本地圖</Text>
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 10, backgroundColor: '#EAE7DF', minHeight: 350 },
  keyHint: { position: 'absolute', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(44,44,44,0.82)', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  keyHintText: { color: '#fff', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAE7DF' },
  centerEmoji: { fontSize: 48, marginBottom: 12 },
  centerText: { fontSize: 14, color: Colors.textSecondary },
});
