import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function JoinTripScreen() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useAuthStore();
  const router = useRouter();
  const [trip, setTrip] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'already' | 'error'>('loading');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!id || authLoading) return;
    loadTrip();
  }, [id, authLoading, user]);

  const loadTrip = async () => {
    setStatus('loading');
    const { data: tripData } = await supabase.from('trips').select('*').eq('id', id).single();
    if (!tripData) { setStatus('error'); return; }
    setTrip(tripData);

    if (!user) { setStatus('ready'); return; }

    const { data: existing } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    setStatus(existing ? 'already' : 'ready');
  };

  const handleJoin = async () => {
    if (!user || !trip) return;
    setJoining(true);
    const displayName =
      (user as any).user_metadata?.full_name ||
      (user as any).user_metadata?.display_name ||
      user.email?.split('@')[0] ||
      '旅伴';

    const { error } = await supabase.from('trip_members').insert({
      trip_id: id,
      user_id: user.id,
      display_name: displayName,
      avatar_emoji: '😀',
      role: 'member',
      email: user.email,
    });

    setJoining(false);
    if (error) {
      alert('加入失敗：' + error.message);
    } else {
      router.replace(`/trip/${id}/itinerary` as any);
    }
  };

  if (authLoading || status === 'loading') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emoji}>❌</Text>
        <Text style={styles.title}>找不到行程</Text>
        <Text style={styles.sub}>連結可能已失效</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/trips' as any)}>
          <Text style={styles.btnText}>回首頁</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (status === 'already') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.title}>你已加入此行程</Text>
        <Text style={styles.sub}>{trip?.name}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace(`/trip/${id}/itinerary` as any)}>
          <Text style={styles.btnText}>進入行程</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.emoji}>{trip?.cover_emoji || '✈️'}</Text>
      <Text style={styles.title}>{trip?.name}</Text>
      <Text style={styles.sub}>{trip?.destination}</Text>
      <Text style={styles.dates}>
        {trip?.start_date?.replace(/-/g, '/')} – {trip?.end_date?.replace(/-/g, '/')}
      </Text>

      {!user ? (
        <>
          <Text style={styles.hint}>請先登入才能加入行程</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={styles.btnText}>前往登入</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.hint}>你收到了一個行程邀請！</Text>
          <TouchableOpacity style={styles.btn} onPress={handleJoin} disabled={joining}>
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>加入行程</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/trips' as any)}>
            <Text style={styles.skipText}>先不加入</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background, padding: 32,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 4, textAlign: 'center' },
  dates: { fontSize: 13, color: Colors.textLight, marginBottom: 32 },
  hint: { fontSize: 14, color: Colors.textSecondary, marginBottom: 20, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary, paddingHorizontal: 48,
    paddingVertical: 16, borderRadius: 16, marginBottom: 12,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  skipBtn: { paddingVertical: 10 },
  skipText: { color: Colors.textLight, fontSize: 14 },
});
