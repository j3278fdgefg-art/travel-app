import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../../constants/colors';

const tabEmoji = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
);

export default function TripLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textLight,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="itinerary" options={{ title: '行程', tabBarIcon: tabEmoji('📅') }} />
      <Tabs.Screen name="map" options={{ title: '地圖', tabBarIcon: tabEmoji('🗺️') }} />
      <Tabs.Screen name="bookings" options={{ title: '預訂', tabBarIcon: tabEmoji('🧾') }} />
      <Tabs.Screen name="expenses" options={{ title: '記帳', tabBarIcon: tabEmoji('💰') }} />
      <Tabs.Screen name="checklist" options={{ title: '準備', tabBarIcon: tabEmoji('✅') }} />
      <Tabs.Screen name="members" options={{ title: '成員', tabBarIcon: tabEmoji('👥') }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}
