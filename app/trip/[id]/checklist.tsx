import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, Modal, Alert,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { ChecklistItem } from '../../../types';

const TABS: Array<{ key: ChecklistItem['type']; label: string; emoji: string }> = [
  { key: 'todo', label: '待辦', emoji: '✅' },
  { key: 'packing', label: '攜帶', emoji: '🎒' },
  { key: 'shopping', label: '想買', emoji: '🛍️' },
];

const SUGGESTIONS: Record<ChecklistItem['type'], string[]> = {
  todo: ['辦理國際駕照', '攜帶台灣駕照(正本)', '購買旅遊平安險', '填VJW快速通關', '換日幣', '辦理漫遊/購買SIM卡'],
  packing: ['護照', '信用卡/現金', '換洗衣物', '充電器', '轉接插頭', '藥品', '雨傘', '防曬'],
  shopping: ['藥妝', '零食', '伴手禮', '文具'],
};

export default function ChecklistScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, checklist, members, fetchChecklist, fetchMembers, addChecklistItem, toggleChecklistItem, deleteChecklistItem, updateChecklistItem } = useTripStore();
  const id = params.id || currentTrip?.id || '';
  const [activeTab, setActiveTab] = useState<ChecklistItem['type']>('todo');
  const [filterMember, setFilterMember] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (id) { fetchChecklist(id); fetchMembers(id); }
  }, [id]);

  const filtered = checklist.filter((i) => {
    if (i.type !== activeTab) return false;
    if (filterMember && i.member_name !== filterMember) return false;
    return true;
  });
  const doneCount = filtered.filter((i) => i.is_done).length;

  const handleAdd = async () => {
    const text = newItem.trim();
    if (!text) return;
    await addChecklistItem({ trip_id: id, type: activeTab, content: text, is_done: false, member_name: filterMember });
    setNewItem('');
  };

  const handleSuggestion = async (text: string) => {
    const exists = checklist.find((i) => i.content === text && i.type === activeTab);
    if (exists) return;
    await addChecklistItem({ trip_id: id, type: activeTab, content: text, is_done: false });
  };

  const handleDelete = (item: ChecklistItem) => {
    if (window.confirm(`確定刪除「${item.content}」？`)) {
      deleteChecklistItem(item.id);
    }
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditingItem(item);
    setEditText(item.content);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editText.trim()) return;
    await updateChecklistItem(editingItem.id, editText.trim());
    setEditingItem(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>準備清單</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={styles.tabEmoji}>{t.emoji}</Text>
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity style={[styles.filterBtn, !filterMember && styles.filterBtnActive]} onPress={() => setFilterMember(null)}>
          <Text style={[styles.filterText, !filterMember && styles.filterTextActive]}>共同</Text>
        </TouchableOpacity>
        {members.map((m) => (
          <TouchableOpacity key={m.id} style={[styles.filterBtn, filterMember === m.display_name && styles.filterBtnActive]} onPress={() => setFilterMember(filterMember === m.display_name ? null : m.display_name)}>
            <Text style={[styles.filterText, filterMember === m.display_name && styles.filterTextActive]}>{m.avatar_emoji} {m.display_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{TABS.find((t) => t.key === activeTab)?.emoji} {TABS.find((t) => t.key === activeTab)?.label}事項</Text>
            {filtered.length > 0 && (
              <Text style={styles.progressLabel}>{doneCount} / {filtered.length} 完成</Text>
            )}
          </View>
          {filtered.length > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((doneCount / filtered.length) * 100)}%` }]} />
            </View>
          )}
          {filtered.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <TouchableOpacity onPress={() => toggleChecklistItem(item.id, !item.is_done)}>
                <View style={[styles.checkbox, item.is_done && styles.checkboxDone]}>
                  {item.is_done && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
              <Text style={[styles.itemText, item.is_done && styles.itemTextDone]} onPress={() => toggleChecklistItem(item.id, !item.is_done)}>
                {item.content}
              </Text>
              <View style={styles.itemActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
                  <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>還沒有項目，從下方輸入或選擇建議清單新增</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.suggestionTitle}>建議清單（點擊快速新增）</Text>
          {SUGGESTIONS[activeTab].filter((s) => !checklist.find((i) => i.content === s && i.type === activeTab)).map((s) => (
            <TouchableOpacity key={s} style={styles.suggestionRow} onPress={() => handleSuggestion(s)}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.addBar}>
        <TextInput style={styles.addInput} value={newItem} onChangeText={setNewItem}
          placeholder="新增項目..." placeholderTextColor={Colors.textLight}
          onSubmitEditing={handleAdd} returnKeyType="done" />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 編輯 Modal */}
      <Modal visible={!!editingItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>編輯項目</Text>
            <TextInput style={styles.editInput} value={editText} onChangeText={setEditText} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingItem(null)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                <Text style={styles.saveText}>儲存</Text>
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
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  tabLabelActive: { color: '#fff', fontWeight: '600' },
  filterScroll: { maxHeight: 48 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 100 },
  section: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  progressLabel: { fontSize: 12, color: Colors.textSecondary },
  progressTrack: { height: 6, backgroundColor: '#EFEAE0', borderRadius: 99, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 99 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.background, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  itemText: { flex: 1, fontSize: 15, color: Colors.text },
  itemTextDone: { textDecorationLine: 'line-through', color: Colors.textLight },
  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.background },
  emptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 16 },
  suggestionTitle: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500', marginBottom: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.background },
  suggestionText: { fontSize: 14, color: Colors.textSecondary },
  addBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10, paddingBottom: 28 },
  addInput: { flex: 1, height: 44, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.card, borderRadius: 20, padding: 24, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  editInput: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  modalBtns: { flexDirection: 'row', marginTop: 16, gap: 10 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary },
  saveBtn: { flex: 1, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '600' },
});
