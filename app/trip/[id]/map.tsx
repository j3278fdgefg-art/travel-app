import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, Platform, ActivityIndicator, ScrollView, Animated, useWindowDimensions,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { ItineraryItem } from '../../../types';
import { extractCoordsFromUrl } from '../../../lib/mapUtils';

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  transport: { emoji: '🚃', label: '交通' },
  accommodation: { emoji: '🏨', label: '住宿' },
  food: { emoji: '🍽️', label: '美食' },
  attraction: { emoji: '🏞️', label: '景點' },
  other: { emoji: '📍', label: '地點' },
};
const typeMeta = (t?: string) => TYPE_META[t || 'other'] || { emoji: t || '📍', label: '地點' };

const PLACE_TYPE_ZH: Record<string, string> = {
  restaurant: '餐廳', cafe: '咖啡廳', food: '美食', bar: '酒吧', bakery: '烘焙坊',
  lodging: '住宿', tourist_attraction: '景點', store: '商店', shopping_mall: '購物中心',
  convenience_store: '便利商店', park: '公園', subway_station: '地鐵站', train_station: '車站',
  museum: '博物館', spa: 'SPA', amusement_park: '遊樂園', supermarket: '超市', department_store: '百貨',
};
const placeTypeLabel = (t?: string) => (t ? PLACE_TYPE_ZH[t] || t.replace(/_/g, ' ') : '');

// 從 location 擷取純地址文字（去掉 URL 和前綴標記）
function extractAddrText(location: string): string {
  let t = location.trim();
  t = t.replace(/^\[[^\]]*\]\s*/, '');
  t = t.replace(/https?:\/\/\S+/g, '').trim();
  t = t.replace(/[，,]\s*$/, '').trim();
  return t;
}

// 供無 Google API 退路使用
function buildSearchQuery(item: { location?: string; title: string }): string {
  return extractAddrText(item.location || '') || item.title.trim();
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

type GeoHit = { latitude: number; longitude: number; placeId?: string };

// Google 地點文字搜尋 → 座標 + place_id
function googleTextSearch(
  service: any,
  query: string,
  locationBias?: { latitude: number; longitude: number },
): Promise<GeoHit | null> {
  return new Promise((resolve) => {
    if (!query || !service) return resolve(null);
    try {
      const g = (window as any).google;
      const opts: any = { query };
      if (locationBias) {
        opts.location = new g.maps.LatLng(locationBias.latitude, locationBias.longitude);
        opts.radius = 2000;
      }
      service.textSearch(opts, (results: any, status: any) => {
        if (status === g.maps.places.PlacesServiceStatus.OK && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          resolve({ latitude: loc.lat(), longitude: loc.lng(), placeId: results[0].place_id });
        } else resolve(null);
      });
    } catch { resolve(null); }
  });
}

async function resolveItemCoords(item: ItineraryItem, service: any): Promise<GeoHit | null> {
  const locUrl = item.location_url || '';
  const loc = item.location || '';
  const rawUrl = (locUrl || loc).match(/https?:\/\/\S+/)?.[0] || '';

  // 1. 短網址優先 → 追蹤 HTTP 轉址，從最終 URL 取座標
  const isShortUrl = rawUrl && (
    rawUrl.includes('maps.app.goo.gl') ||
    rawUrl.includes('goo.gl/maps') ||
    rawUrl.includes('naver.me') ||
    rawUrl.includes('kko.to')
  );
  if (isShortUrl) {
    let resolvedUrl = '';
    // 透過 server-side proxy 轉址（避開瀏覽器 CORS 限制）
    try {
      const apiResp = await fetch(`/api/resolve-url?url=${encodeURIComponent(rawUrl)}`);
      if (apiResp.ok) resolvedUrl = ((await apiResp.json()) as { url?: string }).url ?? '';
    } catch {}
    // 本地開發備用：直接 fetch（部署後不走這條）
    if (!resolvedUrl) {
      try {
        const resp = await fetch(rawUrl, { redirect: 'follow' });
        resolvedUrl = resp.url;
      } catch {}
    }
    if (resolvedUrl) {
      const coords = extractCoordsFromUrl(resolvedUrl);
      if (coords) return coords;
    }
  }

  // 2. 直接從長網址提取座標（含 @lat,lng 等格式）
  const fromUrl = extractCoordsFromUrl(locUrl) || extractCoordsFromUrl(loc);
  if (fromUrl) return fromUrl;

  // 3. 非短網址的其他 URL → 也嘗試追蹤轉址
  if (rawUrl && !isShortUrl) {
    try {
      const resp = await fetch(rawUrl, { redirect: 'follow' });
      const coords = extractCoordsFromUrl(resp.url);
      if (coords) return coords;
    } catch {}
  }

  // 4. location 地址文字（去掉 URL 後剩餘的純文字）
  const addrText = extractAddrText(loc);
  if (addrText) {
    const hit = await googleTextSearch(service, addrText);
    if (hit) return hit;
  }

  // 5. 行程名稱（最後備用）
  if (item.title.trim()) {
    const hit = await googleTextSearch(service, item.title.trim());
    if (hit) return hit;
  }

  return null;
}

export default function MapScreen() {
  const params = useGlobalSearchParams<{ id: string; q?: string; placeId?: string }>();
  const { currentTrip, days, items, fetchTripById, fetchDays, fetchItems, favorites, fetchFavorites, addFavorite, removeFavorite } = useTripStore();
  const { googleMapsApiKey } = useSettingsStore();
  const { width: winWidth } = useWindowDimensions();
  // 資訊卡最寬 430px，超過後靠左貼齊 (left:12)，right 值動態收縮
  const SHEET_MAX_W = 430;
  const sheetRight = Math.max(68, winWidth - 12 - SHEET_MAX_W);
  const id = params.id || currentTrip?.id || '';
  const iframeRef = useRef<any>(null);

  const defaultQuery = (params.q ? decodeURIComponent(params.q as string) : null)
    || currentTrip?.destination || currentTrip?.name || '釜山';

  const [search, setSearch] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const acServiceRef = useRef<any>(null);
  const acTimer = useRef<any>(null);
  const [place, setPlace] = useState<any | null>(null);
  const [placeCollapsed, setPlaceCollapsed] = useState(false);
  const [route, setRoute] = useState<any | null>(null);
  const [routeCollapsed, setRouteCollapsed] = useState(false);
  const [routing, setRouting] = useState(false);
  const dirServiceRef = useRef<any>(null);
  const dirRendererRef = useRef<any>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const [showFav, setShowFav] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const DRAWER_W = 290;
  const drawerX = useRef(new Animated.Value(DRAWER_W)).current;
  const favX = useRef(new Animated.Value(DRAWER_W)).current;
  useEffect(() => {
    Animated.timing(drawerX, { toValue: showPanel ? 0 : DRAWER_W, duration: 250, useNativeDriver: false }).start();
  }, [showPanel]);
  useEffect(() => {
    Animated.timing(favX, { toValue: showFav ? 0 : DRAWER_W, duration: 250, useNativeDriver: false }).start();
  }, [showFav]);
  const [gLoaded, setGLoaded] = useState(false);
  const [gError, setGError] = useState(false);

  const mapElRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const drawGenRef = useRef(0);
  const showRouteRef = useRef(true);
  const searchMarkerRef = useRef<any>(null);
  const pendingQRef = useRef<string | null>(null);
  const pendingPlaceIdRef = useRef<string | null>(null);

  const locationItems = (() => {
    const dayOrder: Record<string, number> = {};
    days.forEach((d, i) => { dayOrder[d.id] = i; });
    return items
      .filter((item) => item.location?.trim() || item.place_id?.trim() || item.address?.trim() || item.location_url?.trim())
      .sort((a, b) => {
        const dd = (dayOrder[a.day_id] ?? 999) - (dayOrder[b.day_id] ?? 999);
        if (dd !== 0) return dd;
        return (a.time || '').localeCompare(b.time || '');
      });
  })();

  useEffect(() => {
    if (id) { fetchTripById(id); fetchDays(id); fetchItems(id); fetchFavorites(id); }
  }, [id]);

  useEffect(() => {
    if (params.q) {
      const q = decodeURIComponent(params.q as string);
      setSearch(q);
      if (placesRef.current) searchAndShow(q);
      else pendingQRef.current = q;
    }
  }, [params.q]);

  useEffect(() => {
    if (params.placeId) {
      const pid = decodeURIComponent(params.placeId as string);
      if (placesRef.current) showPlaceDetails(pid);
      else pendingPlaceIdRef.current = pid;
    }
  }, [params.placeId]);

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
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          gestureHandling: 'greedy', // 單指即可拖曳/縮放
          zoomControl: false,
        });
        placesRef.current = new google.maps.places.PlacesService(mapRef.current);
        acServiceRef.current = new google.maps.places.AutocompleteService();
        dirServiceRef.current = new google.maps.DirectionsService();
        dirRendererRef.current = new google.maps.DirectionsRenderer({
          map: mapRef.current, suppressMarkers: false,
          polylineOptions: { strokeColor: Colors.info, strokeWeight: 5, strokeOpacity: 0.9 },
        });
        // 點地圖上任何店家 POI → 在 App 內顯示店家資訊（不跳 Google 地圖）
        mapRef.current.addListener('click', (e: any) => {
          if (e.placeId) { e.stop(); showPlaceDetails(e.placeId); }
        });

        // places service 剛建好，處理行程頁帶進來的 pending placeId / query
        if (pendingPlaceIdRef.current) {
          const pid = pendingPlaceIdRef.current;
          pendingPlaceIdRef.current = null;
          setTimeout(() => showPlaceDetails(pid), 0);
        } else if (pendingQRef.current) {
          const pq = pendingQRef.current;
          pendingQRef.current = null;
          setTimeout(() => searchAndShow(pq), 0);
        }
      }
      const map = mapRef.current;
      const gen = ++drawGenRef.current; // 防止非同步重入造成重疊孤兒線

      // 清除舊標記/路線
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

      (async () => {
        const resolved: Array<{ item: ItineraryItem; lat: number; lng: number; placeId?: string }> = [];
        for (const item of locationItems) {
          if (drawGenRef.current !== gen) return; // 已有更新的繪製，放棄這批
          const c = await resolveItemCoords(item, placesRef.current);
          if (c) resolved.push({ item, lat: c.latitude, lng: c.longitude, placeId: c.placeId });
        }
        if (drawGenRef.current !== gen || mapRef.current !== map) return;
        const visMap = showRouteRef.current ? map : null;

        const bounds = new google.maps.LatLngBounds();
        const path: any[] = [];
        const infowindow = new google.maps.InfoWindow();
        resolved.forEach(({ item, lat, lng, placeId }, idx) => {
          const position = { lat, lng };
          bounds.extend(position);
          path.push(position);
          const marker = new google.maps.Marker({
            position, map: visMap, label: { text: String(idx + 1), color: '#fff', fontSize: '12px', fontWeight: '700' },
            title: item.title,
          });
          marker.addListener('click', () => {
            // 有 place_id → 顯示完整店家資訊；否則顯示名稱
            if (placeId) { showPlaceDetails(placeId); return; }
            infowindow.setContent(`<div style="font-size:13px;font-weight:600;color:#2C2C2C;padding:2px 4px;">${idx + 1}. ${item.title}</div>`);
            infowindow.open(map, marker);
          });
          markersRef.current.push(marker);
        });

        if (resolved.length > 1) {
          map.fitBounds(bounds);
          polylineRef.current = new google.maps.Polyline({
            path, map: visMap, strokeColor: Colors.primary, strokeOpacity: 0.85, strokeWeight: 4,
          });
        } else if (resolved.length === 1) {
          map.setCenter(path[0]); map.setZoom(15);
        }
      })();
    } catch {
      setGError(true);
    }
  }, [gLoaded, items, currentTrip]);

  // 切換行程標記/路線顯示（標記、行程綠線、導航路線都一起）
  useEffect(() => {
    showRouteRef.current = showRoute;
    const m = showRoute ? mapRef.current : null;
    markersRef.current.forEach((mk) => mk.setMap(m));
    polylineRef.current?.setMap(m);
    dirRendererRef.current?.setMap(m);
  }, [showRoute]);

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

  const handleSearch = () => searchAndShow(search.trim());

  // 打字時用 Places 文字搜尋取得更多建議地點（最多 ~20 筆、可滑動）
  const onSearchChange = (t: string) => {
    setSearch(t);
    if (acTimer.current) clearTimeout(acTimer.current);
    if (!t.trim() || !placesRef.current) { setPredictions([]); return; }
    acTimer.current = setTimeout(() => {
      placesRef.current.textSearch({ query: t }, (results: any, status: any) => {
        const g = (window as any).google;
        if (status === g.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results.slice(0, 20).map((r: any) => ({
            place_id: r.place_id, name: r.name, address: r.formatted_address,
          })));
        } else setPredictions([]);
      });
    }, 350);
  };

  const pickPrediction = (p: any) => {
    setSearch(p.description);
    setPredictions([]);
    if (p.place_id && placesRef.current) {
      showPlaceDetails(p.place_id); // 放標記 + 跳資訊卡 + 移動地圖
    } else {
      setQuery(p.description); setMapKey((k) => k + 1);
    }
  };

  // 取得店家詳細資訊，在 App 內顯示
  const showPlaceDetails = (placeId: string) => {
    if (!placesRef.current || !placeId) return;
    placesRef.current.getDetails(
      { placeId, fields: ['name', 'rating', 'user_ratings_total', 'formatted_address', 'opening_hours', 'formatted_phone_number', 'types', 'photos', 'geometry', 'website', 'reviews'] },
      (res: any, status: any) => {
        const g = (window as any).google;
        if (status !== g.maps.places.PlacesServiceStatus.OK || !res) return;
        const photos: string[] = [];
        try { (res.photos || []).slice(0, 5).forEach((p: any) => photos.push(p.getUrl({ maxWidth: 600, maxHeight: 320 }))); } catch {}
        let openNow: boolean | undefined;
        try { openNow = res.opening_hours?.isOpen?.(); } catch {}
        if (openNow === undefined) openNow = res.opening_hours?.open_now;
        const loc = res.geometry?.location;
        const reviews = (res.reviews || []).map((r: any) => ({
          author: r.author_name, rating: r.rating, text: r.text, time: r.relative_time_description,
        }));
        setRoute(null);
        setPlaceCollapsed(false);
        setPlace({
          placeId, name: res.name, rating: res.rating, count: res.user_ratings_total,
          address: res.formatted_address, phone: res.formatted_phone_number,
          openNow, weekday: res.opening_hours?.weekday_text || [],
          type: res.types?.[0], photos, website: res.website, reviews,
          lat: loc ? loc.lat() : undefined, lng: loc ? loc.lng() : undefined,
        });
        // 在地圖上放一個標記標出這個地點
        if (loc && mapRef.current) {
          if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
          searchMarkerRef.current = new g.maps.Marker({ position: loc, map: mapRef.current, animation: g.maps.Animation.DROP });
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(16);
        }
      }
    );
  };

  // App 內路線：算路徑、畫在地圖上、列步驟（非即時導航）
  const computeRoute = (dest: { lat: number; lng: number; name?: string }, mode: 'DRIVING' | 'WALKING' | 'TRANSIT') => {
    if (!dirServiceRef.current || !mapRef.current) return;
    const g = (window as any).google;
    setRouting(true);
    const run = (origin: { lat: number; lng: number }) => {
      dirServiceRef.current.route(
        { origin, destination: { lat: dest.lat, lng: dest.lng }, travelMode: g.maps.TravelMode[mode] },
        (result: any, status: any) => {
          setRouting(false);
          if (status === 'OK' && result.routes?.[0]) {
            dirRendererRef.current.setMap(mapRef.current);
            dirRendererRef.current.setDirections(result);
            const leg = result.routes[0].legs[0];
            setRouteCollapsed(false);
            setRoute({
              mode, dest,
              distance: leg.distance?.text, duration: leg.duration?.text,
              steps: (leg.steps || []).map((s: any) => ({
                instr: (s.instructions || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
                dist: s.distance?.text,
              })),
            });
            setPlace(null);
          } else {
            alert('找不到這個交通方式的路線，換一種試試');
          }
        }
      );
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { const c = mapRef.current.getCenter(); run({ lat: c.lat(), lng: c.lng() }); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      const c = mapRef.current.getCenter(); run({ lat: c.lat(), lng: c.lng() });
    }
  };

  const clearRoute = () => {
    setRoute(null);
    try { dirRendererRef.current?.setDirections({ routes: [] }); } catch {}
  };

  // 關閉資訊卡（同時移除搜尋標記）
  const closePlace = () => {
    setPlace(null);
    if (searchMarkerRef.current) { searchMarkerRef.current.setMap(null); searchMarkerRef.current = null; }
  };

  // 收藏
  const toggleSection = (headerId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(headerId)) next.delete(headerId); else next.add(headerId);
      return next;
    });
  };
  const addFavHeader = () => {
    const t = window.prompt('輸入標題名稱');
    if (t?.trim()) addFavorite({ trip_id: id, name: t.trim(), is_header: true } as any);
  };
  const findFav = (p: any) => favorites.find((f) => !f.is_header && ((p.placeId && f.place_id === p.placeId) || f.name === p.name));
  const toggleFav = (p: any) => {
    const existing = findFav(p);
    if (existing) { removeFavorite(existing.id); return; }
    addFavorite({ trip_id: id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, place_id: p.placeId });
  };

  // 導航：優先喚起 Google 地圖 APP；APP 一開啟就取消網頁版 fallback（回到 App 不會卡在網頁地圖）
  const navigateToQuery = () => {
    const dest = query && query !== defaultQuery ? query : (currentTrip?.destination || query);
    if (!dest) { alert('請先搜尋或點選一個地點'); return; }
    const enc = encodeURIComponent(dest);
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (!isMobile) { window.open(webUrl, 'travelExt'); return; }

    const scheme = /Android/i.test(ua) ? `google.navigation:q=${enc}` : `comgooglemaps://?daddr=${enc}&directionsmode=driving`;
    let timer: any;
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('blur', cancel);
    };
    const cancel = () => { if (timer) clearTimeout(timer); cleanup(); };
    const onVis = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('blur', cancel);
    // 1.5 秒內若 App 沒開（頁面仍可見）才退回網頁版
    timer = setTimeout(() => { cleanup(); window.open(webUrl, 'travelExt'); }, 1500);
    window.location.href = scheme;
  };

  // 在地圖放標記並平移（無 place_id 時用座標）
  const markAt = (lat: number, lng: number, label?: string) => {
    const g = (window as any).google;
    if (!g || !mapRef.current) { setQuery(`${lat},${lng}`); setMapKey((k) => k + 1); return; }
    if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
    searchMarkerRef.current = new g.maps.Marker({ position: { lat, lng }, map: mapRef.current, animation: g.maps.Animation.DROP, title: label });
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(16);
  };

  // 點行程地點 → 放標記 + 跳資訊卡
  const showOnMap = async (item: ItineraryItem) => {
    setShowPanel(false);
    setSearch(item.title);
    // 行程綁定了收藏的 place_id → 直接跳資訊卡，不走 textSearch
    if (item.place_id && placesRef.current) {
      showPlaceDetails(item.place_id);
      return;
    }
    if (!placesRef.current) {
      const coords = extractCoordsFromUrl(item.location_url || '') || extractCoordsFromUrl(item.location || '');
      setQuery(coords ? `${coords.latitude},${coords.longitude}` : buildSearchQuery(item));
      setMapKey((k) => k + 1);
      return;
    }
    // 位置：用完整流程（短網址 → URL座標 → 地址文字 → 名稱）
    const c = await resolveItemCoords(item, placesRef.current);
    // 資訊卡：用 title + 座標偏好搜尋，避免全球同名地點污染結果
    const titleHit = await googleTextSearch(placesRef.current, item.title, c ?? undefined);
    if (titleHit?.placeId) { showPlaceDetails(titleHit.placeId); return; }
    // title 找不到 → 退回 resolveItemCoords 的結果
    if (c?.placeId) { showPlaceDetails(c.placeId); return; }
    if (c) { markAt(c.latitude, c.longitude, item.title); return; }
    setQuery(buildSearchQuery(item)); setMapKey((k) => k + 1);
  };

  // 點收藏 → 放標記 + 跳資訊卡
  const showFavOnMap = (f: any) => {
    setShowFav(false);
    if (f.place_id && placesRef.current) { showPlaceDetails(f.place_id); return; }
    if (f.lat != null && f.lng != null) { markAt(f.lat, f.lng, f.name); }
  };

  // 搜尋一個字串 → 放標記 + 跳資訊卡（搜尋列、行程頁帶 q 跳轉共用）
  const searchAndShow = (s: string) => {
    if (!s) return;
    setPredictions([]);
    const coordMatch = s.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    if (coordMatch) { markAt(Number(coordMatch[1]), Number(coordMatch[2])); return; }
    if (placesRef.current) {
      googleTextSearch(placesRef.current, s).then((c) => {
        if (c?.placeId) showPlaceDetails(c.placeId);
        else if (c) markAt(c.latitude, c.longitude, s);
        else { setQuery(s); setMapKey((k) => k + 1); }
      });
    } else {
      setQuery(s); setMapKey((k) => k + 1); // 無金鑰退回內嵌地圖
    }
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
      {/* 地圖（布滿整頁） */}
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

        {/* 浮在地圖上的搜尋列（滿版） */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={onSearchChange}
              placeholder="搜尋景點、地址..."
              placeholderTextColor={Colors.textLight}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {!!search && (
              <TouchableOpacity onPress={() => { setSearch(''); setPredictions([]); }}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {predictions.length > 0 && (
            <ScrollView style={styles.acDropdown} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator>
              {predictions.map((p) => (
                <TouchableOpacity key={p.place_id} style={styles.acRow} onPress={() => pickPrediction(p)}>
                  <Text style={styles.acIcon}>📍</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.acName} numberOfLines={1}>{p.name || p.description}</Text>
                    {!!p.address && <Text style={styles.acAddr} numberOfLines={1}>{p.address}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 右側控制：資訊卡收合、收藏、清單、定位、導航 */}
        <View style={styles.ctrlStack}>
          {place && (
            <TouchableOpacity style={[styles.ctrlBtn, placeCollapsed && styles.ctrlBtnDim]} onPress={() => setPlaceCollapsed((v) => !v)}>
              <Text style={styles.ctrlBtnEmoji}>ℹ️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.ctrlBtn, showFav && styles.ctrlBtnActive]} onPress={() => { setShowFav((v) => !v); setShowPanel(false); }}>
            <Text style={styles.ctrlBtnEmoji}>{showFav ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          {locationItems.length > 0 && (
            <TouchableOpacity style={[styles.ctrlBtn, showPanel && styles.ctrlBtnActive]} onPress={() => { setShowPanel((v) => !v); setShowFav(false); }}>
              <Text style={styles.ctrlBtnEmoji}>📋</Text>
            </TouchableOpacity>
          )}
          {locationItems.length > 0 && (
            <TouchableOpacity style={[styles.ctrlBtn, !showRoute && styles.ctrlBtnDim]} onPress={() => setShowRoute((v) => !v)}>
              <Text style={styles.ctrlBtnEmoji}>{showRoute ? '🛣️' : '🚫'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.ctrlBtn} onPress={handleLocate} disabled={locating}>
            {locating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.ctrlBtnEmoji}>📍</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={navigateToQuery}>
            <Text style={[styles.ctrlBtnEmoji, { color: Colors.primary, fontWeight: '700' }]}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* 右側滑出的行程地點抽屜 */}
        <Animated.View style={[styles.drawer, { width: DRAWER_W, transform: [{ translateX: drawerX }] }]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.panelTitle}>📍 行程地點</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.panelCount}>共 {locationItems.length} 個</Text>
            <TouchableOpacity style={styles.drawerClose} onPress={() => setShowPanel(false)}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16, gap: 9 }}>
            {locationItems.map((item, idx) => {
              const meta = typeMeta(item.type);
              const prevItem = locationItems[idx - 1];
              const isNewDay = !prevItem || prevItem.day_id !== item.day_id;
              const day = days.find((d) => d.id === item.day_id);
              return (
                <React.Fragment key={item.id}>
                  {isNewDay && day && (
                    <Text style={styles.panelDayHeader}>第 {day.day_number} 天 · {day.date}</Text>
                  )}
                  <TouchableOpacity style={styles.placeRow} activeOpacity={0.7} onPress={() => showOnMap(item)}>
                    <View style={styles.placeNum}><Text style={styles.placeNumText}>{idx + 1}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.placeName} numberOfLines={1}>{item.title}</Text>
                      <View style={styles.placeCatRow}>
                        {!!item.time && <Text style={styles.placeTime}>{item.time}</Text>}
                        <Text style={{ fontSize: 11 }}>{meta.emoji}</Text>
                        <Text style={styles.placeCat} numberOfLines={1}>{meta.label}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* 右側滑出的收藏清單抽屜 */}
        <Animated.View style={[styles.drawer, { width: DRAWER_W, transform: [{ translateX: favX }] }]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.panelTitle}>❤️ 收藏清單</Text>
            <TouchableOpacity style={styles.favAddHeader} onPress={addFavHeader}>
              <Text style={styles.favAddHeaderText}>＋ 標題</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Text style={styles.panelCount}>{favorites.filter((f) => !f.is_header).length} 個</Text>
            <TouchableOpacity style={styles.drawerClose} onPress={() => setShowFav(false)}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {favorites.length === 0 ? (
            <Text style={styles.favEmpty}>還沒有收藏。{'\n'}點地圖上的店家，按 🤍 即可收藏。</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16, gap: 9 }}>
              {favorites.map((f, idx) => {
                if (f.is_header) {
                  const collapsed = collapsedSections.has(f.id);
                  return (
                    <TouchableOpacity key={f.id} style={styles.favSectionHeader} onPress={() => toggleSection(f.id)}>
                      <Text style={styles.favSectionText}>{f.name}</Text>
                      <Text style={styles.favSectionChevron}>{collapsed ? '▶' : '▼'}</Text>
                      <TouchableOpacity onPress={() => removeFavorite(f.id)} style={styles.favRemove}>
                        <Text style={{ fontSize: 13 }}>🗑️</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }
                // 找最近的上層標題，若標題已收合則隱藏
                let parentHeader: typeof f | undefined;
                for (let i = idx - 1; i >= 0; i--) {
                  if (favorites[i].is_header) { parentHeader = favorites[i]; break; }
                }
                if (parentHeader && collapsedSections.has(parentHeader.id)) return null;
                return (
                  <View key={f.id} style={styles.placeRow}>
                    <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={0.7} onPress={() => showFavOnMap(f)}>
                      <Text style={styles.placeName} numberOfLines={1}>{f.name}</Text>
                      {!!f.address && <Text style={styles.placeCat} numberOfLines={1}>{f.address}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeFavorite(f.id)} style={styles.favRemove}>
                      <Text style={{ fontSize: 13 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* 店家完整資訊卡（收合時整張隱藏，靠右側 ℹ️ 展開；點地圖店家 / 標記時跳出，不離開 App） */}
        {place && !route && !placeCollapsed && (
          <View style={[styles.sheet, { right: sheetRight }]}>
            {/* 標題列常駐 */}
            <View style={styles.placeHeaderBar}>
              <Text style={[styles.placeCardName, { flex: 1 }]} numberOfLines={2}>{place.name}</Text>
              <TouchableOpacity
                style={styles.openGmapBtn}
                onPress={() => {
                  const url = place.placeId
                    ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
                    : `https://www.google.com/maps?q=${place.lat},${place.lng}`;
                  window.open(url, 'travelExt');
                }}
              >
                <Text style={styles.openGmapText}>🗺️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleFav(place)} style={styles.favHeart}>
                <Text style={{ fontSize: 20 }}>{findFav(place) ? '❤️' : '🤍'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closePlace} style={[styles.drawerClose, { marginLeft: 6 }]}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
              {place.photos?.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                  {place.photos.map((url: string, i: number) => (
                    <img key={i} src={url} style={{ width: 220, height: 140, objectFit: 'cover', display: 'block', marginRight: 6 }} />
                  ))}
                </ScrollView>
              )}
              <View style={styles.placeCardBody}>
                <View style={styles.placeMetaRow}>
                  {!!place.rating && <Text style={styles.placeMeta}>⭐ {place.rating}（{place.count || 0}）</Text>}
                  {!!place.type && <Text style={styles.placeMeta}>{placeTypeLabel(place.type)}</Text>}
                  {place.openNow !== undefined && (
                    <Text style={[styles.placeMeta, { color: place.openNow ? Colors.success : Colors.danger, fontWeight: '700' }]}>
                      {place.openNow ? '營業中' : '休息中'}
                    </Text>
                  )}
                </View>

                {/* 路線按鈕 */}
                {place.lat !== undefined && (
                  <TouchableOpacity style={styles.routeBtn} onPress={() => computeRoute({ lat: place.lat, lng: place.lng, name: place.name }, 'DRIVING')} disabled={routing}>
                    {routing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.routeBtnText}>🚗 在 App 內查看路線</Text>}
                  </TouchableOpacity>
                )}

                {!!place.address && <Text style={styles.placeAddr}>📍 {place.address}</Text>}
                {!!place.phone && <Text style={styles.placeAddr}>📞 {place.phone}</Text>}
                {!!place.website && (
                  <Text style={styles.placeLink} onPress={() => window.open(place.website, 'travelExt')} numberOfLines={1}>🌐 {place.website}</Text>
                )}
                {place.weekday?.length > 0 && (
                  <View style={styles.hoursBox}>
                    {place.weekday.map((d: string, i: number) => <Text key={i} style={styles.hoursLine}>{d}</Text>)}
                  </View>
                )}
                {place.reviews?.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.reviewsTitle}>評論</Text>
                    {place.reviews.map((r: any, i: number) => (
                      <View key={i} style={styles.reviewItem}>
                        <View style={styles.reviewTop}>
                          <Text style={styles.reviewAuthor} numberOfLines={1}>{r.author}</Text>
                          <Text style={styles.reviewRating}>{'⭐'.repeat(Math.round(r.rating || 0))}</Text>
                          {!!r.time && <Text style={styles.reviewTime}>{r.time}</Text>}
                        </View>
                        {!!r.text && <Text style={styles.reviewText}>{r.text}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {/* App 內路線面板（可收合，不擋地圖） */}
        {route && (
          <View style={[styles.sheet, { right: sheetRight }]}>
            <View style={styles.routeHeader}>
              <Text style={styles.routeSummary}>{route.duration} · {route.distance}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setRouteCollapsed((v) => !v)} style={styles.drawerClose}>
                <Text style={styles.drawerCloseText}>{routeCollapsed ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearRoute} style={[styles.drawerClose, { marginLeft: 6 }]}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {!routeCollapsed && (
              <>
                <View style={styles.modeTabs}>
                  {(['WALKING', 'DRIVING', 'TRANSIT'] as const).map((m) => (
                    <TouchableOpacity key={m} style={[styles.modeTab, route.mode === m && styles.modeTabActive]} onPress={() => computeRoute(route.dest, m)}>
                      <Text style={[styles.modeTabText, route.mode === m && styles.modeTabTextActive]}>{m === 'WALKING' ? '🚶 走路' : m === 'DRIVING' ? '🚗 開車' : '🚌 大眾運輸'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                  {route.steps.map((s: any, i: number) => (
                    <View key={i} style={styles.stepRow}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                      <Text style={styles.stepInstr}>{s.instr}</Text>
                      {!!s.dist && <Text style={styles.stepDist}>{s.dist}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mapContainer: { flex: 1, backgroundColor: '#EAE7DF', position: 'relative', overflow: 'hidden' },
  // 浮在地圖上的搜尋列
  searchRow: { position: 'absolute', top: 14, left: 14, right: 14, zIndex: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 58, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  searchIcon: { fontSize: 17 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: Colors.text },
  searchClear: { fontSize: 15, color: Colors.textLight, paddingHorizontal: 4 },
  acDropdown: { position: 'absolute', top: 64, left: 0, right: 0, maxHeight: 320, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  acRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  acIcon: { fontSize: 13 },
  acName: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  acAddr: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  // 右側控制按鈕
  ctrlStack: { position: 'absolute', top: 86, right: 14, gap: 8, zIndex: 9 },
  ctrlBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  ctrlBtnActive: { backgroundColor: Colors.primary },
  ctrlBtnDim: { opacity: 0.55 },
  ctrlBtnEmoji: { fontSize: 18 },
  // 右側滑出抽屜
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: Colors.background, paddingHorizontal: 12, paddingTop: 12, zIndex: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: -4, height: 0 }, elevation: 8 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  drawerClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  drawerCloseText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '700' },
  panelTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  panelCount: { fontSize: 12, color: Colors.textSecondary },
  panelDayHeader: { fontSize: 12, fontWeight: '700', color: Colors.primary, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: 13, padding: 11, borderWidth: 1, borderColor: Colors.border },
  placeNum: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  placeNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  placeTime: { fontSize: 11, fontWeight: '700', color: Colors.primaryDark },
  placeName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  placeCatRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  placeCat: { fontSize: 11, color: Colors.textSecondary },
  sheet: { position: 'absolute', top: 76, bottom: 14, left: 12, right: 68, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', zIndex: 7, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  photoStrip: { },
  placeHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  placeCardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  placeCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favHeart: { padding: 4 },
  openGmapBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  openGmapText: { fontSize: 18 },
  favEmpty: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 30, lineHeight: 22 },
  favRemove: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#FBE8E8', justifyContent: 'center', alignItems: 'center' },
  favAddHeader: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.primary + '20', borderRadius: 8, marginLeft: 8 },
  favAddHeaderText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  favSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primary + '15', borderRadius: 10 },
  favSectionText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.primary },
  favSectionChevron: { fontSize: 11, color: Colors.primary },
  placeCardName: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.text },
  placeMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  placeMeta: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  placeAddr: { fontSize: 13, color: Colors.textSecondary, marginTop: 8, lineHeight: 19 },
  placeLink: { fontSize: 13, color: Colors.info, marginTop: 8 },
  hoursBox: { marginTop: 10, backgroundColor: Colors.background, borderRadius: 10, padding: 10, gap: 2 },
  hoursLine: { fontSize: 12, color: Colors.textSecondary },
  reviewsTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  reviewItem: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.background },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAuthor: { fontSize: 13, fontWeight: '600', color: Colors.text, maxWidth: 120 },
  reviewRating: { fontSize: 11 },
  reviewTime: { fontSize: 11, color: Colors.textLight, flex: 1, textAlign: 'right' },
  reviewText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  routeBtn: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  routeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  routeHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  routeSummary: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modeTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center' },
  modeTabActive: { backgroundColor: Colors.primary },
  modeTabText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  modeTabTextActive: { color: '#fff' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.background },
  stepNum: { width: 20, fontSize: 13, fontWeight: '700', color: Colors.primary },
  stepInstr: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  stepDist: { fontSize: 12, color: Colors.textLight },
  keyHint: { position: 'absolute', bottom: 14, left: 12, right: 12, backgroundColor: 'rgba(44,44,44,0.82)', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, zIndex: 4 },
  keyHintText: { color: '#fff', fontSize: 12, textAlign: 'center', fontWeight: '500' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAE7DF' },
  centerEmoji: { fontSize: 48, marginBottom: 12 },
  centerText: { fontSize: 14, color: Colors.textSecondary },
});
