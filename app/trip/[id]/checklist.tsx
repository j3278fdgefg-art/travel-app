import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, Modal,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { PageBackground } from '../../../components/PageBackground';
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
  const { background } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';
  const [activeTab, setActiveTab] = useState<ChecklistItem['type']>('todo');
  const [newItem, setNewItem] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (id) { fetchChecklist(id); fetchMembers(id); }
  }, [id]);

  const filtered = checklist.filter((i) => i.type === activeTab);
  const doneCount = filtered.filter((i) => i.is_done).length;

  const toggleMember = (name: string) => {
    setSelectedMembers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleAdd = async () => {
    const itemText = newItem.trim();
    if (!itemText) return;
    let content = itemText;
    if (activeTab === 'shopping' && newShopName.trim()) {
      content = `${newShopName.trim()}｜${itemText}`;
    }
    const memberName = selectedMembers.length > 0 ? selectedMembers.join(',') : null;
    await addChecklistItem({ trip_id: id, type: activeTab, content, is_done: false, member_name: memberName });
    setNewItem('');
    if (activeTab === 'shopping') setNewShopName('');
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

  const parseContent = (item: ChecklistItem) => {
    if (activeTab === 'shopping' && item.content.includes('｜')) {
      const idx = item.content.indexOf('｜');
      return { shop: item.content.slice(0, idx), text: item.content.slice(idx + 1) };
    }
    return { shop: null, text: item.content };
  };

  const getItemMembers = (item: ChecklistItem): string[] => {
    if (!item.member_name) return [];
    return item.member_name.split(',').filter(Boolean);
  };

  return (
    <SafeAreaView style={styles.container}>
      <PageBackground variant={background} />
      <View style={{ height: 12 }} />

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
          {filtered.map((item) => {
            const { shop, text } = parseContent(item);
            const itemMembers = getItemMembers(item);
            return (
              <View key={item.id} style={styles.itemRow}>
                <TouchableOpacity onPress={() => toggleChecklistItem(item.id, !item.is_done)}>
                  <View style={[styles.checkbox, item.is_done && styles.checkboxDone]}>
                    {item.is_done && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0 }} onTouchEnd={() => toggleChecklistItem(item.id, !item.is_done)}>
                  {!!shop && <Text style={styles.shopLabel} numberOfLines={1}>{shop}</Text>}
                  <Text style={[styles.itemText, item.is_done && styles.itemTextDone]} numberOfLines={2}>{text}</Text>
                  {itemMembers.length > 0 && (
                    <View style={styles.memberTags}>
                      {itemMembers.map((n) => (
                        <View key={n} style={styles.memberTag}>
                          <Text style={styles.memberTagText}>{n}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.itemActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
                    <Text style={styles.actionEmoji}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(item)}>
                    <Text style={styles.actionEmoji}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
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

      {/* 新增列 */}
      <View style={styles.addBar}>
        {activeTab === 'shopping' && (
          <TextInput
            style={[styles.addInput, styles.shopInput]}
            value={newShopName}
            onChangeText={setNewShopName}
            placeholder="店名"
            placeholderTextColor={Colors.textLight}
            returnKeyType="next"
          />
        )}
        <TextInput
          style={[styles.addInput, { flex: 1 }]}
          value={newItem}
          onChangeText={setNewItem}
          placeholder="新增項目..."
          placeholderTextColor={Colors.textLight}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.memberBtn} onPress={() => setMemberPickerOpen(true)}>
          <Text style={styles.memberBtnText}>
            {selectedMembers.length === 0 ? '👥' : `${selectedMembers.length}人`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 成員選擇 Modal */}
      <Modal visible={memberPickerOpen} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>選擇共同檢視／編輯的人</Text>
            <TouchableOpacity
              style={[styles.pickerRow, selectedMembers.length === 0 && styles.pickerRowActive]}
              onPress={() => setSelectedMembers([])}
            >
              <Text style={styles.pickerRowText}>全部成員（預設）</Text>
              {selectedMembers.length === 0 && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
            </TouchableOpacity>
            {members.map((m) => {
              const selected = selectedMembers.includes(m.display_name);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.pickerRow, selected && styles.pickerRowActive]}
                  onPress={() => toggleMember(m.display_name)}
                >
                  <Text style={styles.pickerRowText}>{m.avatar_emoji} {m.display_name}</Text>
                  {selected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.pickerConfirmBtn} onPress={() => setMemberPickerOpen(false)}>
              <Text style={styles.pickerConfirmText}>確認</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  tabLabelActive: { color: '#fff', fontWeight: '600' },
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
  shopLabel: { fontSize: 10, color: Colors.primary, fontWeight: '600', marginBottom: 1 },
  itemText: { fontSize: 15, color: Colors.text },
  itemTextDone: { textDecorationLine: 'line-through', color: Colors.textLight },
  memberTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  memberTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(124,154,107,0.12)' },
  memberTagText: { fontSize: 10, color: '#5A7A4A', fontWeight: '600' },
  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  actionBtnDanger: { backgroundColor: '#FBE8E8', borderColor: '#FBE8E8' },
  actionEmoji: { fontSize: 14 },
  emptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 16 },
  suggestionTitle: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500', marginBottom: 10 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.background },
  suggestionText: { fontSize: 14, color: Colors.textSecondary },
  addBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8, paddingBottom: 28, alignItems: 'center' },
  addInput: { height: 44, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text },
  shopInput: { width: 88 },
  memberBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  memberBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerBox: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.background },
  pickerRowActive: { },
  pickerRowText: { fontSize: 15, color: Colors.text },
  pickerConfirmBtn: { marginTop: 18, height: 48, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  pickerConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
