import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput,
} from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useAuthStore } from '../../../store/authStore';
import { TripMember } from '../../../types';
import { supabase } from '../../../lib/supabase';

const DEFAULT_AVATARS = ['😀', '👨', '👩'];


export default function MembersScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { members, currentTrip, activityLogs, fetchMembers, fetchActivityLogs, fetchTripById, addMember, removeMember, logActivity } = useTripStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const id = params.id || currentTrip?.id || '';
  const isOwner = currentTrip?.owner_id === user?.id;
  const ownerAutoAdded = useRef(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<TripMember | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [lineId, setLineId] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [avatar, setAvatar] = useState('😀');
  const [customEmoji, setCustomEmoji] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id) {
      fetchTripById(id);
      fetchMembers(id);
      fetchActivityLogs(id);
    }
  }, [id]);

  // 自動將主辦人加入成員列表
  useEffect(() => {
    if (!id || !user || !currentTrip || ownerAutoAdded.current) return;
    if (members.length === 0) return;
    const ownerMember = members.find((m) => m.role === 'owner');
    if (!ownerMember && currentTrip.owner_id === user.id) {
      ownerAutoAdded.current = true;
      const displayName = (user as any).user_metadata?.full_name
        || user.email?.split('@')[0]
        || '主辦人';
      addMember({ trip_id: id, display_name: displayName, avatar_emoji: '👑', role: 'owner', user_id: user.id } as any);
    }
  }, [members, currentTrip, user]);

  // 如果完全沒成員，先建立主辦人
  useEffect(() => {
    if (!id || !user || !currentTrip || ownerAutoAdded.current) return;
    if (members.length === 0 && currentTrip.owner_id === user.id) {
      ownerAutoAdded.current = true;
      const displayName = (user as any).user_metadata?.full_name
        || user.email?.split('@')[0]
        || '主辦人';
      addMember({ trip_id: id, display_name: displayName, avatar_emoji: '👑', role: 'owner', user_id: user.id } as any);
    }
  }, [currentTrip, user]);

  const openAdd = () => {
    setEditingMember(null);
    setName(''); setEmail(''); setLineId(''); setIgHandle(''); setAvatar('😀'); setCustomEmoji('');
    setModalVisible(true);
  };

  const openEdit = (m: TripMember) => {
    setEditingMember(m);
    setName(m.display_name);
    setEmail(m.email || '');
    setLineId(m.line_id || '');
    setIgHandle(m.ig_handle || '');
    setAvatar(m.avatar_emoji);
    setCustomEmoji(DEFAULT_AVATARS.includes(m.avatar_emoji) ? '' : m.avatar_emoji);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    const duplicate = members.some(
      (m) => m.display_name.trim() === name.trim() && (!editingMember || m.id !== editingMember.id)
    );
    if (duplicate) {
      alert('已有相同名稱的成員，請使用不同名稱');
      return;
    }

    const actorName = user?.email || '主辦人';

    if (editingMember) {
      const oldName = editingMember.display_name;
      const newName = name.trim();
      const { error } = await supabase.from('trip_members').update({
        display_name: newName, avatar_emoji: avatar,
        ...(isOwner ? { email: email.trim() || null } : {}),
        line_id: lineId.trim() || null, ig_handle: igHandle.trim() || null,
      }).eq('id', editingMember.id);
      if (error) { alert('儲存失敗：' + error.message); return; }

      // 名稱改了就同步更新 expenses 和 checklist 裡的舊名稱
      if (newName !== oldName) {
        await supabase.from('expenses').update({ paid_by_name: newName }).eq('trip_id', id).eq('paid_by_name', oldName);
        const { data: exps } = await supabase.from('expenses').select('id, shared_with').eq('trip_id', id);
        for (const exp of exps || []) {
          if (Array.isArray(exp.shared_with) && exp.shared_with.includes(oldName)) {
            await supabase.from('expenses').update({ shared_with: exp.shared_with.map((n: string) => n === oldName ? newName : n) }).eq('id', exp.id);
          }
        }
        await supabase.from('checklist_items').update({ member_name: newName }).eq('trip_id', id).eq('member_name', oldName);
      }

      await logActivity(id, actorName, '編輯成員', `${oldName}${newName !== oldName ? ` → ${newName}` : ''}`);
      await fetchMembers(id);
    } else {
      const { error } = await supabase.from('trip_members').insert({
        trip_id: id, display_name: name.trim(), avatar_emoji: avatar, role: 'member',
        email: email.trim() || null, line_id: lineId.trim() || null, ig_handle: igHandle.trim() || null,
      } as any);
      if (error) { alert('新增失敗：' + error.message); return; }
      await logActivity(id, actorName, '新增成員', name.trim());
      await fetchMembers(id);
    }
    setModalVisible(false);
  };

  const handleLeave = async () => {
    const ownerMem = members.find((m) => m.role === 'owner' && m.user_id === user?.id);
    if (!ownerMem) return;
    if (window.confirm('確定要退出這個行程嗎？行程仍會保留，但你將從成員列表中移除。')) {
      await removeMember(ownerMem.id);
      setModalVisible(false);
      router.replace('/trips');
    }
  };

  const handleRemove = (m: TripMember) => {
    if (!isOwner) return;
    if (window.confirm(`確定要移除 ${m.display_name}？`)) removeMember(m.id);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://travel-app-app.vercel.app';

  const generateLink = async () => {
    if (!id) return null;
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from('trips').update({ single_use_token: token, invite_expires_at: expiresAt } as any).eq('id', id);
    return `${origin}/join/${id}?ot=${token}`;
  };

  const shareLine = async () => {
    const url = await generateLink();
    if (!url) return;
    const msg = `加入我的旅程「${currentTrip?.name ?? '旅程'}」！點連結加入一起計畫 ✈️\n${url}`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
  };

  const copyLink = async () => {
    const url = await generateLink();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const actionIcon = (action: string) => {
    if (action.includes('新增')) return '➕';
    if (action.includes('編輯') || action.includes('修改')) return '✏️';
    if (action.includes('刪除')) return '🗑️';
    if (action.includes('加入')) return '👋';
    return '📝';
  };

  const ownerMember = members.find((m) => m.role === 'owner');
  const nonOwnerMembers = members.filter((m) => m.role !== 'owner');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* 旅程標題卡 */}
        <View style={styles.tripHeader}>
          <Text style={styles.tripName}>{currentTrip?.name ?? '旅程'}</Text>
          <Text style={styles.tripDate}>
            {currentTrip?.start_date?.replace(/-/g, '/')} - {currentTrip?.end_date?.replace(/-/g, '/')}
          </Text>
          <View style={styles.syncRow}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>雲端即時同步中</Text>
          </View>

          {/* 分享按鈕列（僅主辦人） */}
          {isOwner && (
            <View style={styles.shareRow}>
              <TouchableOpacity style={styles.shareBtn} onPress={shareLine}>
                <Text style={styles.shareIcon}>💬</Text>
                <Text style={styles.shareBtnText}>LINE 分享</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={copyLink}>
                <Text style={styles.shareIcon}>{copied ? '✅' : '🔗'}</Text>
                <Text style={styles.shareBtnText}>{copied ? '已複製' : '複製連結'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {copied && <Text style={styles.copiedHint}>邀請連結已複製！（5 分鐘有效，使用後失效）</Text>}
        </View>

        {/* 成員清單 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>同行成員 ({members.length} 人)</Text>
            <Text style={styles.sectionHint}>點成員名字可編輯</Text>
          </View>
          <View style={styles.grid}>
            {/* 主辦人優先顯示 */}
            {ownerMember && (() => {
              const canEditOwner = isOwner;
              return (
                <TouchableOpacity
                  key={ownerMember.id}
                  style={[styles.memberCard, styles.ownerCard]}
                  onPress={() => canEditOwner && openEdit(ownerMember)}
                  activeOpacity={canEditOwner ? 0.7 : 1}
                >
                  <View style={[styles.avatarCircle, styles.ownerAvatarCircle]}>
                    <Text style={styles.avatarEmoji}>{ownerMember.avatar_emoji}</Text>
                  </View>
                  <Text style={styles.memberName}>{ownerMember.display_name}</Text>
                  <Text style={styles.roleTag}>👑 主辦人</Text>
                  {!!ownerMember.line_id && <Text style={styles.contactTag}>💬 {ownerMember.line_id}</Text>}
                  {!!ownerMember.ig_handle && <Text style={styles.contactTag}>📸 {ownerMember.ig_handle}</Text>}
                </TouchableOpacity>
              );
            })()}

            {/* 其他成員 */}
            {nonOwnerMembers.map((m) => {
              const canEdit = isOwner || m.user_id === user?.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={styles.memberCard}
                  onPress={() => canEdit && openEdit(m)}
                  activeOpacity={canEdit ? 0.7 : 1}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarEmoji}>{m.avatar_emoji}</Text>
                  </View>
                  <Text style={styles.memberName}>{m.display_name}</Text>
                  <Text style={styles.roleTag}>✈️ 旅伴</Text>
                  {!!m.line_id && <Text style={styles.contactTag}>💬 {m.line_id}</Text>}
                  {!!m.ig_handle && <Text style={styles.contactTag}>📸 {m.ig_handle}</Text>}
                  <View style={styles.memberActions}>
                    {isOwner && (
                      <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(m)}>
                        <Ionicons name="trash-outline" size={13} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* 新增按鈕 */}
            <TouchableOpacity style={styles.addCard} onPress={openAdd}>
              <Ionicons name="add" size={28} color={Colors.textLight} />
              <Text style={styles.addCardText}>新增成員</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 編輯紀錄（只有主辦人看得到） */}
        {isOwner && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📋 編輯紀錄</Text>
              <Text style={styles.sectionHint}>僅主辦人可見</Text>
            </View>
            {activityLogs.length === 0 ? (
              <Text style={styles.emptyLog}>尚無編輯紀錄</Text>
            ) : (
              activityLogs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={styles.logIcon}>
                    <Text style={{ fontSize: 16 }}>{actionIcon(log.action)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.logTop}>
                      <Text style={styles.logMember}>{log.member_name}</Text>
                      <Text style={styles.logAction}>{log.action}</Text>
                    </View>
                    {log.detail ? <Text style={styles.logDetail}>{log.detail}</Text> : null}
                    <Text style={styles.logTime}>{dayjs(log.created_at).format('MM/DD HH:mm')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 新增/編輯成員 Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalWrapper}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editingMember ? '編輯成員' : '新增成員'}</Text>

            <Text style={styles.label}>成員名稱 *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例：洋洋"
              placeholderTextColor={Colors.textLight}
            />

            {isOwner && (
              <>
                <Text style={styles.label}>App 帳號（email，選填）</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="例：friend@gmail.com"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </>
            )}

            <Text style={styles.label}>LINE ID（選填）</Text>
            <TextInput
              style={styles.input}
              value={lineId}
              onChangeText={setLineId}
              placeholder="例：line_id123"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Instagram（選填）</Text>
            <TextInput
              style={styles.input}
              value={igHandle}
              onChangeText={setIgHandle}
              placeholder="例：@yang.yang"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />

            <Text style={styles.label}>頭像</Text>
            <View style={styles.avatarRow}>
              {DEFAULT_AVATARS.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.avatarBtn, avatar === a && !customEmoji && styles.avatarBtnSelected]}
                  onPress={() => { setAvatar(a); setCustomEmoji(''); }}
                >
                  <Text style={styles.avatarBtnText}>{a}</Text>
                </TouchableOpacity>
              ))}
              {customEmoji ? (
                <TouchableOpacity
                  style={[styles.avatarBtn, styles.avatarBtnSelected]}
                  onPress={() => {}}
                >
                  <Text style={styles.avatarBtnText}>{customEmoji}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.customEmojiRow}>
              <TextInput
                style={styles.customEmojiInput}
                value={customEmoji}
                onChangeText={(v) => { setCustomEmoji(v); if (v.trim()) setAvatar(v.trim()); }}
                placeholder="貼上任意 emoji"
                placeholderTextColor={Colors.textLight}
                maxLength={8}
              />
              <TouchableOpacity
                style={styles.customEmojiConfirm}
                onPress={() => { if (customEmoji.trim()) setAvatar(customEmoji.trim()); }}
              >
                <Text style={styles.customEmojiConfirmText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleSave}>
                <Text style={styles.createText}>{editingMember ? '儲存' : '新增'}</Text>
              </TouchableOpacity>
            </View>

            {editingMember?.role === 'owner' && editingMember?.user_id === user?.id && (
              <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
                <Text style={styles.leaveText}>退出行程</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tripHeader: { margin: 16, borderRadius: 18, backgroundColor: Colors.primary, padding: 20, alignItems: 'center' },
  tripName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4, textAlign: 'center' },
  tripDate: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentLight },
  syncText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  shareRow: { flexDirection: 'row', gap: 8 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  shareIcon: { fontSize: 15 },
  shareBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  copiedHint: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 8 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  sectionHint: { fontSize: 12, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  memberCard: { width: '47%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  ownerCard: { borderWidth: 2, borderColor: Colors.accent },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  ownerAvatarCircle: { backgroundColor: '#FFF8E7' },
  avatarEmoji: { fontSize: 32 },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 2, textAlign: 'center' },
  roleTag: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  contactTag: { fontSize: 10, color: Colors.textLight, marginBottom: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.background },
  removeBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2' },
  addCard: { width: '47%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', minHeight: 130 },
  addCardText: { fontSize: 13, color: Colors.textLight, marginTop: 6 },
  emptyLog: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 20 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.background },
  logIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  logMember: { fontSize: 14, fontWeight: '600', color: Colors.text },
  logAction: { fontSize: 13, color: Colors.primary },
  logDetail: { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  logTime: { fontSize: 11, color: Colors.textLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalWrapper: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalContent: { padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  avatarBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  avatarBtnSelected: { backgroundColor: Colors.primaryLight, borderWidth: 2, borderColor: Colors.primary },
  avatarBtnText: { fontSize: 26 },
  customEmojiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  customEmojiInput: { flex: 1, height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 12, fontSize: 18, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  customEmojiConfirm: { width: 46, height: 46, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  customEmojiConfirmText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  leaveBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  leaveText: { color: Colors.danger, fontSize: 14 },
});
