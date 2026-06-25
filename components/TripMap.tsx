// components/TripMap.tsx
// Native(iOS/Android)的後備版本:確保 leaflet 不會被打包進原生包。
// 你現在 web-first,native 暫時顯示提示即可;之後要原生地圖再換成 expo-maps。
import { View, Text, StyleSheet } from 'react-native';

export default function TripMap(_props: { tripId?: string }) {
  return (
    <View style={styles.center}>
      <Text>地圖目前僅支援網頁版</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
