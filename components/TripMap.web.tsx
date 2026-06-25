// components/TripMap.web.tsx
// 網頁版地圖:Metro 會自動在 web 載入這支(.web.tsx),native 載入 TripMap.tsx
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { supabase } from 'C:\Users\長腿叔叔\travel-app\lib\supabase'; // ← 改成你專案實際的 supabase client 路徑

type Place = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
  order_index: number;
};

const LEAFLET_VERSION = '1.9.4';

// 只注入一次 Leaflet 的 CSS(用 CDN,避開 Metro 處理 CSS 的問題)
function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
  document.head.appendChild(link);
}

export default function TripMap({ tripId }: { tripId?: string }) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) 從 Supabase 撈點位(依 order_index 排序)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('places')
        .select('id, name, latitude, longitude, image_url, order_index')
        .order('order_index', { ascending: true });
      if (tripId) query = query.eq('trip_id', tripId); // 有帶 tripId 才過濾
      const { data, error } = await query;
      if (cancelled) return;
      if (error) return setError(error.message);
      setPlaces((data ?? []) as Place[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // 2) 點位載入後才建立地圖(動態 import leaflet → 只在 client 執行)
  useEffect(() => {
    if (!places || places.length === 0) return;
    let map: any;
    let disposed = false;

    (async () => {
      ensureLeafletCss();
      const mod = await import('leaflet');
      const L: any = (mod as any).default ?? mod;
      if (disposed || !containerRef.current) return;

      // 在 react-native-web 裡,View 的 ref 就是底層的 <div> DOM 節點
      const el = containerRef.current as HTMLElement;

      // 熱重載時避免「已初始化」錯誤
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      map = L.map(el);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // 把預設圖示指到 CDN,否則打包後會破圖
      const icon = L.icon({
        iconUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon.png`,
        iconRetinaUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon-2x.png`,
        shadowUrl: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-shadow.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const latlngs: [number, number][] = [];
      places.forEach((p, i) => {
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        latlngs.push([lat, lng]);

        const img = p.image_url
          ? `<img src="${p.image_url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-top:6px" />`
          : '';
        const html = `<div style="min-width:160px;font-family:sans-serif">
            <strong>${i + 1}. ${p.name}</strong>${img}
          </div>`;

        L.marker([lat, lng], { icon }).addTo(map).bindPopup(html);
      });

      // 依行程順序把點連起來(直線示意,非沿道路)
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: '#2563eb', weight: 3, opacity: 0.85 }).addTo(map);
      }

      map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
      // 容器尺寸有時還沒算好,補一刀避免灰底
      setTimeout(() => map && map.invalidateSize(), 0);
    })();

    return () => {
      disposed = true;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [places]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text>地圖載入失敗:{error}</Text>
      </View>
    );
  }
  if (!places) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (places.length === 0) {
    return (
      <View style={styles.center}>
        <Text>還沒有任何點位</Text>
      </View>
    );
  }

  return <View ref={containerRef} style={styles.map} />;
}

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 400, width: '100%' },
  center: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center' },
});
