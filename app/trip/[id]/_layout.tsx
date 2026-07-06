import { useEffect, useState } from 'react';
import { Tabs, router, useGlobalSearchParams } from 'expo-router';
import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../lib/supabase';

const tabEmoji = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
);

function BackToTrips() {
  return (
    <TouchableOpacity
      onPress={() => router.push('/trips')}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}
    >
      <Ionicons name="chevron-back" size={18} color={Colors.primary} />
      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600', marginLeft: -2 }}>我的旅程</Text>
    </TouchableOpacity>
  );
}

function TripHeaderTitle() {
  const currentTrip = useTripStore((s) => s.currentTrip);
  if (!currentTrip) return null;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text }} numberOfLines={1}>
        {currentTrip.cover_emoji} {currentTrip.name}
      </Text>
      <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
        {dayjs(currentTrip.start_date).format('MM/DD')} - {dayjs(currentTrip.end_date).format('MM/DD')}
      </Text>
    </View>
  );
}

export default function TripLayout() {
  const params = useGlobalSearchParams<{ id: string }>();
  const fetchTripById = useTripStore((s) => s.fetchTripById);
  const { user, loading: authLoading } = useAuthStore();
  const [access, setAccess] = useState<'checking' | 'granted' | 'denied'>('checking');

  useEffect(() => {
    if (params.id) fetchTripById(params.id);
  }, [params.id]);

  // 只有旅程主辦人或已加入的成員才能看這個旅程，其他人一律導去邀請確認頁
  useEffect(() => {
    if (!params.id || authLoading) return;
    let cancelled = false;
    setAccess('checking');
    (async () => {
      const { data: trip } = await supabase.from('trips').select('owner_id').eq('id', params.id).single();
      if (cancelled) return;
      if (!trip || !user) { setAccess('denied'); return; }
      if (trip.owner_id === user.id) { setAccess('granted'); return; }
      const { data: membership } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', params.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setAccess(membership ? 'granted' : 'denied');
    })();
    return () => { cancelled = true; };
  }, [params.id, user, authLoading]);

  useEffect(() => {
    if (access === 'denied' && params.id) router.replace(`/join/${params.id}` as any);
  }, [access, params.id]);

  if (access !== 'granted') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerLeft: () => <BackToTrips />,
        headerTitle: () => <TripHeaderTitle />,
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
      <Tabs.Screen name="favorites" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
