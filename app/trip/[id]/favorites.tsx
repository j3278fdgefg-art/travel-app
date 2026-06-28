import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, Modal,
} from 'react-native';
import { useGlobalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { PageBackground } from '../../../components/PageBackground';
import { Favorite } from '../../../types';
import { supabase } from '../../../lib/supabase';

export default function FavoritesScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, favorites, fetchFavorites, fetchTripById, removeFavorite } = useTripStore();
  const { background } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';

  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catInput, setCatInput] = useState('');
  const [movingFav, setMovingFav] = useState<Favorite | null>(null);
  const [moveInput, setMoveInput] = useState('');

  useEffect(() => {
    if (id) { fetchTripById(id); fetchFavorites(id); }
  }, [id]);

  const realFavs = favorites.filter((f) => !f.is_header);
  const uniqueCategories = Array.from(new Set(realFavs.map((f) => f.category || ''))).sort();
  const grouped = uniqueCategories.reduce<Record<string, Favorite[]>>((acc, cat) => {
    acc[cat] = realFavs.filter((f) => (f.category || '') === cat);
    return acc;
  }, {});

  const namedCats = uniqueCategories.filter((c) => c !== '');

  const renameCategory = async (oldCat: string, newCat: string) => {
    const targets = realFavs.filter((f) => (f.category || '') === oldCat);
    for (const f of targets) {
      await supabase.from('favorites').update({ category: newCat || null }).eq('id', f.id);
    }
    await fetchFavorites(id);
    setEditingCat(null);
  };

  const moveToCategory = async (fav: Favorite, newCat: string) => {
    await supabase.from('favorites').update({ category: newCat || null }).eq('id', fav.id);
    await fetchFavorites(id);
    setMovingFav(null);
    setMoveInput('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <PageBackground variant={background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>收藏管理</Text>
          {currentTrip?.name ? <Text style={styles.headerSub} numberOfLines={1}>{currentTrip.name}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => router.push(`/trip/${id}/map` as any)}
        >
          <Text style={styles.mapBtnText}>🗺️ 地圖</Text>
        </TouchableOpacity>
      </View>

      {realFavs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🤍</Text>
          <Text style={styles.emptyText}>還沒有收藏地點</Text>
          <Text style={styles.emptySubtext}>到地圖頁點選店家，按 🤍 即可收藏</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(['', ...namedCats] as string[]).map((cat) => {
            const items = grouped[cat];
            if (!items || items.length === 0) return null;
            const isEditing = editingCat === cat;
            return (
              <View key={cat || '__none__'} style={styles.section}>
                <View style={styles.sectionHeader}>
                  {isEditing ? (
                    <View style={styles.renameRow}>
                      <TextInput
                        style={styles.renameInput}
                        value={catInput}
                        onChangeText={setCatInput}
                        autoFocus
                        placeholder="分類名稱"
                        placeholderTextColor={Colors.textLight}
                        onSubmitEditing={() => renameCategory(cat, catInput.trim())}
                      />
                      <TouchableOpacity style={styles.renameConfirm} onPress={() => renameCategory(cat, catInput.trim())}>
                        <Text style={styles.renameConfirmText}>確認</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingCat(null)} style={styles.renameCancelBtn}>
                        <Text style={styles.renameCancelText}>取消</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.sectionTitle}>{cat === '' ? '未分類' : `# ${cat}`}</Text>
                      <Text style={styles.sectionCount}>{items.length} 個</Text>
                      {cat !== '' && (
                        <TouchableOpacity
                          style={styles.renameBtn}
                          onPress={() => { setEditingCat(cat); setCatInput(cat); }}
                        >
                          <Text style={styles.renameBtnText}>重命名</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
                {items.map((f) => (
                  <View key={f.id} style={styles.favRow}>
                    <Text style={styles.favHeart}>❤️</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.favName} numberOfLines={1}>{f.name}</Text>
                      {!!f.address && <Text style={styles.favAddr} numberOfLines={1}>{f.address}</Text>}
                    </View>
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => { setMovingFav(f); setMoveInput(''); }}
                    >
                      <Text style={styles.moveBtnText}>移動</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFavorite(f.id)}>
                      <Text style={styles.deleteBtnEmoji}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* 移動分類 Modal */}
      <Modal visible={!!movingFav} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[styles.modalTitle, { flex: 1 }]}>移動到分類</Text>
              <TouchableOpacity onPress={() => setMovingFav(null)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.movingName} numberOfLines={1}>「{movingFav?.name}」</Text>
            <TouchableOpacity
              style={[styles.moveCatOption, (movingFav?.category || '') === '' && styles.moveCatOptionActive]}
              onPress={() => moveToCategory(movingFav!, '')}
            >
              <Text style={[styles.moveCatText, (movingFav?.category || '') === '' && { color: '#fff' }]}>無分類</Text>
            </TouchableOpacity>
            {namedCats.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.moveCatOption, (movingFav?.category || '') === cat && styles.moveCatOptionActive]}
                onPress={() => moveToCategory(movingFav!, cat)}
              >
                <Text style={[styles.moveCatText, (movingFav?.category || '') === cat && { color: '#fff' }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.newCatRow}>
              <TextInput
                style={styles.newCatInput}
                value={moveInput}
                onChangeText={setMoveInput}
                placeholder="新分類名稱..."
                placeholderTextColor={Colors.textLight}
                onSubmitEditing={() => moveInput.trim() && moveToCategory(movingFav!, moveInput.trim())}
              />
              <TouchableOpacity
                style={[styles.newCatConfirm, !moveInput.trim() && { opacity: 0.4 }]}
                onPress={() => moveInput.trim() && moveToCategory(movingFav!, moveInput.trim())}
                disabled={!moveInput.trim()}
              >
                <Text style={styles.newCatConfirmText}>確認</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  mapBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary },
  mapBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 60 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  sectionCount: { fontSize: 12, color: Colors.textSecondary },
  renameRow: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' },
  renameInput: { flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: Colors.primary, paddingHorizontal: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.card },
  renameConfirm: { paddingHorizontal: 12, height: 34, borderRadius: 8, backgroundColor: Colors.primary, justifyContent: 'center' },
  renameConfirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  renameCancelBtn: { paddingHorizontal: 8, height: 34, justifyContent: 'center' },
  renameCancelText: { color: Colors.textSecondary, fontSize: 13 },
  renameBtn: { marginLeft: 'auto' as any, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.primaryLight },
  renameBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: 12, padding: 12, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  favHeart: { fontSize: 16 },
  favName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  favAddr: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  moveBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  moveBtnText: { fontSize: 12, color: Colors.textSecondary },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  deleteBtnEmoji: { fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyText: { fontSize: 17, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  movingName: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 12 },
  moveCatOption: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.background, marginBottom: 6 },
  moveCatOptionActive: { backgroundColor: Colors.primary },
  moveCatText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  newCatRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  newCatInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  newCatConfirm: { paddingHorizontal: 16, height: 44, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center' },
  newCatConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
