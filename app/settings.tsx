import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useSettingsStore, BG_OPTIONS, BgVariant } from '../store/settingsStore';
import { PageBackground } from '../components/PageBackground';

const THUMB: Record<BgVariant, any> = {
  mountain: Platform.OS === 'web' ? { background: 'linear-gradient(#ECEFE4,#A8BE92)' } : { backgroundColor: '#A8BE92' },
  coast: Platform.OS === 'web' ? { background: 'linear-gradient(#EAE7DC,#C7D7DE)' } : { backgroundColor: '#C7D7DE' },
  doodle: { backgroundColor: '#F5F2EC' },
  none: { backgroundColor: '#F5F2EC', borderWidth: 1, borderColor: Colors.border },
};

export default function SettingsScreen() {
  const router = useRouter();
  const { background, setBackground } = useSettingsStore();

  return (
    <SafeAreaView style={styles.container}>
      <PageBackground variant={background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>背景主題</Text>
        <Text style={styles.sectionDesc}>選擇在每個頁面卡片背後顯示的桌布，隨時可切換。</Text>

        <View style={styles.list}>
          {BG_OPTIONS.map((opt) => {
            const selected = background === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => setBackground(opt.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.thumb, THUMB[opt.key]]}>
                  {opt.key === 'doodle' && <Text style={{ fontSize: 22 }}>✏️</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optName}>{opt.name}</Text>
                  <Text style={styles.optDesc}>{opt.desc}</Text>
                </View>
                {selected
                  ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                  : <View style={styles.radioOff} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primaryDark },
  backBtn: { marginRight: 8, padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  sectionDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 14, padding: 12, borderWidth: 2, borderColor: 'transparent' },
  rowSelected: { borderColor: Colors.primary },
  thumb: { width: 46, height: 46, borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  optName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  optDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border },
});
