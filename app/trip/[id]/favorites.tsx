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

  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catInput, setCatInput] = useState('');
  const [movingFav, setMovingFav] = useState<Favorite | null>(null);
  const [moveInput, setMoveInput] = useState('');

  useEffect(() => {
    if (id) { fetchTripById(id); fetchFavorites(id); }
  }, [id]);

  const realFavs = favorites.filter((f) => !f.is_header);
  const uniqueCategories = Array.from(new Set(realFavs.map((f) => f.category || ''))).sort();
  const namedCats = uniqueCategories.filter((c) => c !== '');
  const grouped = uniqueCategories.reduce<Record<string, Favorite[]>>((acc, cat) => {
    acc[cat] = realFavs.filter((f) => (f.category || '') === cat);
    return acc;
  }, {});

  const displayFavs = selectedCat === 'all'
    ? realFavs
    : realFavs.filter((f) => (f.category || '') === selectedCat);

  const renameCategory = async (oldCat: string, newCat: string) => {
    const targets = realFavs.filter((f) => (f.category || '') === oldCat);
    for (const f of targets) {
      await supabase.from('favorites').update({ category: newCat || null }).eq('id', f.id);
    }
    await fetchFavorites(id);
    setEditingCat(null);
    if (selectedCat === oldCat) setSelectedCat(newCat || '');
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>收藏管理</Text>
          {currentTrip?.name ? <Text style={styles.headerSub} numberOfLines={1}>{currentTrip.name}</Text> : null}
        </View>
      </View>

      {realFavs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🤍</Text>
          <Text style={styles.emptyText}>還沒有收藏地點</Text>
          <Text style={styles.emptySubtext}>到地圖頁點選店家，按 🤍 即可收藏</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {/* 左側：分類清單 (1/4) */}
          <ScrollView style={styles.leftPanel} contentContainerStyle={{ paddingVertical: 8 }}>
            <TouchableOpacity
              style={[styles.catBtn, selectedCat === 'all' && styles.catBtnActive]}
              onPress={() => setSelectedCat('all')}
            >
              <Text style={[styles.catBtnText, selectedCat === 'all' && styles.catBtnTextActive]} numberOfLines={2}>
                全部{'\n'}
                <Text style={styles.catBtnCount}>{realFavs.length}</Text>
              </Text>
            </TouchableOpacity>
            {(['', ...namedCats] as string[]).map((cat) => {
              const count = (grouped[cat] || []).length;
              if (count === 0 && cat !== '') return null;
              const label = cat === '' ? '未分類' : cat;
              const isActive = selectedCat === cat;
              const isEditing = editingCat === cat;
              return (
                <View key={cat || '__none__'}>
                  {isEditing ? (
                    <View style={styles.renameBox}>
                      <TextInput
                        style={styles.renameInput}
                        value={catInput}
                        onChangeText={setCatInput}
                        autoFocus
                        placeholder="分類名稱"
                        placeholderTextColor={Colors.textLight}
                        onSubmitEditing={() => renameCategory(cat, catInput.trim())}
                      />
                      <TouchableOpacity style={styles.renameOk} onPress={() => renameCategory(cat, catInput.trim())}>
                        <Text style={styles.renameOkText}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingCat(null)}>
                        <Text style={styles.renameCancel}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.catBtn, isActive && styles.catBtnActive]}
                      onPress={() => setSelectedCat(cat)}
                      onLongPress={() => cat !== '' ? (setEditingCat(cat), setCatInput(cat)) : undefined}
                    >
                      <Text style={[styles.catBtnText, isActive && styles.catBtnTextActive]} numberOfLines={2}>
                        {label}{'\n'}
                        <Text style={[styles.catBtnCount, isActive && { color: '#fff' }]}>{count}</Text>
                      </Text>
                      {cat !== '' && (
                        <TouchableOpacity
                          style={styles.editIcon}
                          onPress={() => { setEditingCat(cat); setCatInput(cat); }}
                        >
                          <Text style={[styles.editIconText, isActive && { color: '#fff' }]}>✎</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* 右側：地點清單 (3/4) */}
          <ScrollView style={styles.rightPanel} contentContainerStyle={{ padding: 10, paddingBottom: 40, gap: 8 }}>
            {displayFavs.length === 0 ? (
              <Text style={styles.emptyRight}>此分類沒有收藏</Text>
            ) : displayFavs.map((f) => (
              <View key={f.id} style={styles.favRow}>
                <Text style={styles.favHeart}>❤️</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.favName} numberOfLines={1}>{f.name}</Text>
                  {!!f.address && <Text style={styles.favAddr} numberOfLines={1}>{f.address}</Text>}
                  {!!f.category && <Text style={styles.favCatTag} numberOfLines={1}>#{f.category}</Text>}
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
          </ScrollView>
        </View>
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
  body: { flex: 1, flexDirection: 'row' },
  leftPanel: { flex: 1, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.card },
  rightPanel: { flex: 3, backgroundColor: Colors.background },
  catBtn: { paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  catBtnActive: { backgroundColor: Colors.primary },
  catBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text, lineHeight: 18 },
  catBtnTextActive: { color: '#fff' },
  catBtnCount: { fontSize: 11, color: Colors.textSecondary, fontWeight: '400' },
  editIcon: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  editIconText: { fontSize: 13, color: Colors.textSecondary },
  renameBox: { padding: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6, flexDirection: 'row', alignItems: 'center' },
  renameInput: { flex: 1, height: 32, borderRadius: 8, borderWidth: 1, borderColor: Colors.primary, paddingHorizontal: 8, fontSize: 13, color: Colors.text, backgroundColor: Colors.background },
  renameOk: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  renameOkText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  renameCancel: { fontSize: 15, color: Colors.textSecondary, fontWeight: '700', paddingHorizontal: 4 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: 12, padding: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  favHeart: { fontSize: 15 },
  favName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  favAddr: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  favCatTag: { fontSize: 11, color: Colors.primary, marginTop: 2 },
  moveBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  moveBtnText: { fontSize: 11, color: Colors.textSecondary },
  deleteBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  deleteBtnEmoji: { fontSize: 13 },
  emptyRight: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 40 },
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
