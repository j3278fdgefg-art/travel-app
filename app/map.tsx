// app/map.tsx
// 範例路由頁。網址 /map 會顯示地圖;若帶 ?tripId=xxx 就只顯示該行程的點位。
import { View } from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import TripMap from '../components/TripMap'; // ← 若你用 src/,改成對應路徑

export default function MapScreen() {
  const { tripId } = useGlobalSearchParams<{ tripId?: string }>();

  return (
    <View style={{ flex: 1 }}>
      <TripMap tripId={tripId} />
    </View>
  );
}
