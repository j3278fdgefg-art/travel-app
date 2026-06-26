import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { useTripStore } from '../../../store/tripStore';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { PageBackground } from '../../../components/PageBackground';
import { CURRENCIES, EXCHANGE_RATES, Expense } from '../../../types';

const LEGACY_CAT_EMOJI: Record<string, string> = {
  food: '🍽️', transport: '🚗', accommodation: '🏨',
  shopping: '🛍️', activity: '🎡', insurance: '🛡️', other: '📌',
};
const catEmoji = (c: string) => LEGACY_CAT_EMOJI[c] || c;

// emoji → DB 合法 category 值（自訂 emoji 一律存 other）
const EMOJI_TO_DB_CAT: Record<string, string> = {
  '🍽️': 'food', '🚗': 'transport', '🏨': 'accommodation',
  '🛍️': 'shopping', '🎡': 'activity', '🛡️': 'insurance', '📌': 'other',
};
const toDbCategory = (emoji: string): string => EMOJI_TO_DB_CAT[emoji] ?? 'other';

const DEFAULT_EXPENSE_CATS = ['🏨', '🍽️', '🚗'];

function loadExpenseCats(userId: string): string[] {
  try { const s = localStorage.getItem(`expense_cats_${userId}`); return s ? JSON.parse(s) : DEFAULT_EXPENSE_CATS; }
  catch { return DEFAULT_EXPENSE_CATS; }
}
function saveExpenseCats(userId: string, list: string[]) {
  localStorage.setItem(`expense_cats_${userId}`, JSON.stringify(list));
}

const webSelectStyle: any = {
  height: 46, backgroundColor: Colors.background, borderRadius: 12,
  paddingLeft: 14, fontSize: 15, color: Colors.text,
  border: `1px solid ${Colors.border}`, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};

const emptyForm = () => ({
  title: '', amount: '', currency: 'TWD',
  category: '🍽️',
  paidBy: '', payMethod: 'card' as 'card' | 'cash',
  date: dayjs().format('YYYY-MM-DD'),
  sharedWith: [] as string[],
  note: '',
});

// 計算每個成員的淨餘額（從費用紀錄取人名，刪除的成員仍計入）
function calcBalances(expenses: Expense[]) {
  const paid: Record<string, number> = {};
  const shouldPay: Record<string, number> = {};

  expenses.forEach((e) => {
    const shared: string[] = e.shared_with?.length > 0 ? e.shared_with : [e.paid_by_name];
    const twd = e.amount_twd || e.amount;
    const perPerson = twd / shared.length;
    if (paid[e.paid_by_name] === undefined) { paid[e.paid_by_name] = 0; shouldPay[e.paid_by_name] = 0; }
    paid[e.paid_by_name] += twd;
    shared.forEach((n) => {
      if (shouldPay[n] === undefined) { paid[n] = paid[n] ?? 0; shouldPay[n] = 0; }
      shouldPay[n] += perPerson;
    });
  });

  return Object.keys({ ...paid, ...shouldPay }).map((n) => ({
    name: n,
    paid: paid[n] ?? 0,
    shouldPay: shouldPay[n] ?? 0,
    net: (paid[n] ?? 0) - (shouldPay[n] ?? 0),
  }));
}

// 最小動線分帳：貪婪配對最大債主與欠款人
function calcSettlement(balances: { name: string; net: number }[]) {
  const creditors = balances.filter((b) => b.net > 0.5).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.net < -0.5).map((b) => ({ ...b }));
  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => a.net - b.net);

  const txns: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amount = Math.min(creditors[i].net, -debtors[j].net);
    if (amount > 0.5) {
      txns.push({ from: debtors[j].name, to: creditors[i].name, amount: Math.round(amount) });
    }
    creditors[i].net -= amount;
    debtors[j].net += amount;
    if (creditors[i].net < 0.5) i++;
    if (-debtors[j].net < 0.5) j++;
  }
  return txns;
}

export default function ExpensesScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const { currentTrip, expenses, members, fetchExpenses, fetchMembers, fetchTripById, addExpense, deleteExpense, updateExpense, logActivity } = useTripStore();
  const { user } = useAuthStore();
  const { background } = useSettingsStore();
  const id = params.id || currentTrip?.id || '';
  const isOwner = currentTrip?.owner_id != null && user?.id != null && currentTrip.owner_id === user.id;

  const [filterMembers, setFilterMembers] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [expenseCats, setExpenseCats] = useState(DEFAULT_EXPENSE_CATS);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');

  useEffect(() => {
    if (id) { fetchTripById(id); fetchExpenses(id); fetchMembers(id); }
  }, [id]);

  useEffect(() => {
    if (user) setExpenseCats(loadExpenseCats(user.id));
  }, [user]);

  const handleAddCat = () => {
    const e = newCatInput.trim();
    if (e && !expenseCats.includes(e)) {
      const next = [...expenseCats, e];
      setExpenseCats(next);
      if (user) saveExpenseCats(user.id, next);
    }
    setNewCatInput(''); setAddingCat(false);
  };

  const handleRemoveCat = (e: string) => {
    const next = expenseCats.filter((x) => x !== e);
    setExpenseCats(next);
    if (user) saveExpenseCats(user.id, next);
  };

  const memberNames = members.map((m) => m.display_name);

  // 篩選：複選，同時比對付款人和共同消費人
  const filtered = filterMembers.size === 0
    ? expenses
    : expenses.filter((e) => {
        const shared: string[] = e.shared_with?.length > 0 ? e.shared_with : [e.paid_by_name];
        return filterMembers.has(e.paid_by_name) || shared.some((n) => filterMembers.has(n));
      });

  // 總計：若有選成員，加總「被選成員的應分擔金額」
  const total = filterMembers.size === 0
    ? filtered.reduce((s, e) => s + (e.amount_twd || e.amount), 0)
    : filtered.reduce((s, e) => {
        const shared: string[] = e.shared_with?.length > 0 ? e.shared_with : [e.paid_by_name];
        const perPerson = (e.amount_twd || e.amount) / shared.length;
        return s + [...filterMembers].filter((n) => shared.includes(n)).length * perPerson;
      }, 0);

  const grouped = filtered.reduce<Record<string, Expense[]>>((acc, e) => {
    const d = e.date; if (!acc[d]) acc[d] = []; acc[d].push(e); return acc;
  }, {});

  const toggleMember = (name: string) => {
    setFilterMembers((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleShared = (name: string) => {
    setForm((f) => ({
      ...f,
      sharedWith: f.sharedWith.includes(name)
        ? f.sharedWith.filter((n) => n !== name)
        : [...f.sharedWith, name],
    }));
  };

  const setField = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const openAdd = () => {
    setEditingExpense(null);
    const ownerName = members.find((m) => m.role === 'owner')?.display_name || '';
    setForm({ ...emptyForm(), category: expenseCats[0] || '🍽️', paidBy: ownerName, sharedWith: ownerName ? [ownerName] : [] });
    setModalVisible(true);
  };

  const openEdit = (e: Expense) => {
    setEditingExpense(e);
    setForm({
      title: e.title, amount: String(e.amount), currency: e.currency,
      category: e.category, paidBy: e.paid_by_name || '',
      payMethod: e.payment_method, date: e.date,
      sharedWith: e.shared_with || [],
      note: e.note || '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.amount) return;
    setSaving(true);
    const amtNum = parseFloat(form.amount);
    const rate = EXCHANGE_RATES[form.currency] ?? 1;
    const ownerName = members.find((m) => m.role === 'owner')?.display_name || '主辦人';

    const sharedWith = form.sharedWith.length > 0 ? form.sharedWith : [form.paidBy || ownerName];

    const dbCategory = toDbCategory(form.category);

    if (editingExpense) {
      await updateExpense(editingExpense.id, {
        title: form.title, amount: amtNum, currency: form.currency,
        amount_twd: Math.round(amtNum * rate), paid_by_name: form.paidBy,
        payment_method: form.payMethod, category: dbCategory, date: form.date,
        shared_with: sharedWith, note: form.note,
      } as any);
      await logActivity(id, ownerName, '編輯消費', `修改「${form.title}」`);
      setSaving(false);
      setModalVisible(false);
    } else {
      const ok = await addExpense({
        trip_id: id, title: form.title, amount: amtNum, currency: form.currency,
        amount_twd: Math.round(amtNum * rate), paid_by_name: form.paidBy || ownerName,
        payment_method: form.payMethod, category: dbCategory, date: form.date,
        shared_with: sharedWith, note: form.note,
      } as any);
      setSaving(false);
      if (ok) {
        await logActivity(id, form.paidBy || ownerName, '新增消費', `${form.title} ${form.currency} ${amtNum.toLocaleString()}`);
        setModalVisible(false);
      }
    }
  };

  const handleDelete = (e: Expense) => {
    if (window.confirm(`確定刪除「${e.title}」？`)) {
      deleteExpense(e.id);
      logActivity(id, members.find((m) => m.role === 'owner')?.display_name || '主辦人', '刪除消費', e.title);
    }
  };

  const balances = calcBalances(expenses);
  const settlements = calcSettlement(balances);

  return (
    <SafeAreaView style={styles.container}>
      <PageBackground variant={background} />
      {/* 頂部總計 */}
      <View style={styles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>
            {filterMembers.size > 0 ? `${[...filterMembers].join('、')} 的分擔金額` : '總支出 (TWD)'}
          </Text>
          <Text style={styles.totalAmount}>NT$ {Math.round(total).toLocaleString()}</Text>
          <Text style={styles.totalSub}>
            {filterMembers.size === 0 ? `共 ${expenses.length} 筆` : `含付款 + 分擔項目`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowSplit(!showSplit)} style={styles.splitToggle}>
          <Ionicons name={showSplit ? 'close-circle-outline' : 'calculator-outline'} size={22} color="#fff" />
          <Text style={styles.splitToggleText}>{showSplit ? '收起' : '分帳'}</Text>
        </TouchableOpacity>
      </View>

      {/* 分帳結算 */}
      {showSplit && (
        <View style={styles.splitCard}>
          <Text style={styles.splitTitle}>💰 各人餘額</Text>
          {balances.map((b) => (
            <View key={b.name} style={styles.splitRow}>
              <Text style={styles.splitName}>{b.name}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.splitDetail}>
                  已付 NT${Math.round(b.paid).toLocaleString()} · 應付 NT${Math.round(b.shouldPay).toLocaleString()}
                </Text>
              </View>
              <Text style={[styles.splitNet, b.net > 0 ? styles.netPositive : b.net < 0 ? styles.netNegative : styles.netZero]}>
                {b.net > 0 ? `+${Math.round(b.net).toLocaleString()}` : Math.round(b.net).toLocaleString()}
              </Text>
            </View>
          ))}
          <Text style={styles.splitHint}>正數 = 別人欠他 ｜ 負數 = 他欠別人</Text>

          {settlements.length > 0 && (
            <>
              <View style={styles.settleDivider} />
              <Text style={styles.settleTitle}>🧾 結算方式（最少動線）</Text>
              {settlements.map((txn, idx) => (
                <View key={idx} style={styles.settleRow}>
                  <Text style={styles.settleFrom}>{txn.from}</Text>
                  <Text style={styles.settleArrow}>→</Text>
                  <Text style={styles.settleTo}>{txn.to}</Text>
                  <Text style={styles.settleAmt}>NT${txn.amount.toLocaleString()}</Text>
                </View>
              ))}
            </>
          )}
          {settlements.length === 0 && (
            <Text style={[styles.splitHint, { marginTop: 8, color: Colors.success }]}>✅ 已全部結清</Text>
          )}
        </View>
      )}

      {/* 成員篩選（複選） */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filterMembers.size === 0 && styles.filterBtnActive]}
          onPress={() => setFilterMembers(new Set())}
        >
          <Text style={[styles.filterText, filterMembers.size === 0 && styles.filterTextActive]}>全體</Text>
        </TouchableOpacity>
        {members.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.filterBtn, filterMembers.has(m.display_name) && styles.filterBtnActive]}
            onPress={() => toggleMember(m.display_name)}
          >
            <Text style={{ fontSize: 12 }}>{m.avatar_emoji}</Text>
            <Text style={[styles.filterText, filterMembers.has(m.display_name) && styles.filterTextActive]}>
              {m.display_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 消費清單 */}
      <ScrollView contentContainerStyle={styles.list}>
        {Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map((date) => {
          const dayTotal = grouped[date].reduce((s, e) => s + (e.amount_twd || e.amount), 0);
          return (
            <View key={date}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateText}>{date}</Text>
                <Text style={styles.dateTotalText}>小計 NT${Math.round(dayTotal).toLocaleString()}</Text>
              </View>
              {grouped[date].map((e) => {
                const shared: string[] = e.shared_with?.length > 0 ? e.shared_with : [e.paid_by_name];
                const perPerson = Math.round((e.amount_twd || e.amount) / shared.length);
                const isExpanded = expandedId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.expenseCard, isExpanded && styles.expenseCardExpanded]}
                    onPress={() => setExpandedId(isExpanded ? null : e.id)}
                    activeOpacity={0.8}
                  >
                    {/* 收合狀態 */}
                    <View style={styles.expenseCollapsed}>
                      <View style={styles.catEmoji}>
                        <Text style={{ fontSize: 20 }}>{catEmoji(e.category)}</Text>
                      </View>
                      <View style={styles.expenseLeft}>
                        <Text style={styles.expenseTitle}>{e.title}</Text>
                        <Text style={styles.expenseShared} numberOfLines={1}>
                          🧑‍🤝‍🧑 {shared.join('、')}
                        </Text>
                      </View>
                      <View style={styles.expenseRight}>
                        <Text style={styles.expenseAmount}>
                          {e.currency !== 'TWD' ? `${e.currency} ${e.amount.toLocaleString()}` : `NT$${e.amount.toLocaleString()}`}
                        </Text>
                        <Text style={styles.perPerson}>每人 NT${perPerson.toLocaleString()}</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} style={{ marginLeft: 4 }} />
                    </View>

                    {/* 展開詳情 */}
                    {isExpanded && (
                      <View style={styles.expenseDetail}>
                        <View style={styles.detailDivider} />
                        <View style={styles.detailGrid}>
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>類別</Text>
                            <Text style={styles.detailValue}>{catEmoji(e.category)}</Text>
                          </View>
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>付款人</Text>
                            <Text style={styles.detailValue}>{e.paid_by_name}</Text>
                          </View>
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>付款方式</Text>
                            <Text style={styles.detailValue}>{e.payment_method === 'card' ? '💳 刷卡' : '💵 現金'}</Text>
                          </View>
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>日期</Text>
                            <Text style={styles.detailValue}>{e.date}</Text>
                          </View>
                          {e.currency !== 'TWD' && (
                            <View style={styles.detailItem}>
                              <Text style={styles.detailLabel}>原始金額</Text>
                              <Text style={styles.detailValue}>{e.currency} {e.amount.toLocaleString()}</Text>
                            </View>
                          )}
                          <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>換算 TWD</Text>
                            <Text style={styles.detailValue}>NT${(e.amount_twd || e.amount).toLocaleString()}</Text>
                          </View>
                        </View>

                        {/* 分擔明細 */}
                        <View style={styles.splitDetail2}>
                          <Text style={styles.detailLabel}>分擔明細</Text>
                          <View style={styles.splitPeople}>
                            {shared.map((name) => (
                              <View key={name} style={styles.splitPersonChip}>
                                <Text style={styles.splitPersonName}>{name}</Text>
                                <Text style={styles.splitPersonAmt}>NT${perPerson.toLocaleString()}</Text>
                              </View>
                            ))}
                          </View>
                        </View>

                        {!!e.note && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={styles.detailLabel}>備註</Text>
                            <Text style={styles.detailValue}>{e.note}</Text>
                          </View>
                        )}

                        <View style={styles.detailActions}>
                          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(e)}>
                            <Text style={styles.btnEmoji}>✏️</Text>
                            <Text style={styles.editBtnText}>編輯</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(e)}>
                            <Text style={styles.btnEmoji}>🗑️</Text>
                            <Text style={styles.deleteBtnText}>刪除</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💰</Text>
            <Text style={styles.emptyText}>還沒有消費記錄</Text>
            <Text style={styles.emptySubtext}>點擊右下角 ＋ 記下第一筆花費</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* 新增/編輯 Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingExpense ? '編輯消費' : '新增消費'}</Text>

            <Text style={styles.label}>類別</Text>
            <View style={styles.catRow}>
              {expenseCats.map((e) => (
                <View key={e} style={styles.catBtnWrap}>
                  <TouchableOpacity
                    style={[styles.catBtn, form.category === e && styles.catBtnSelected]}
                    onPress={() => setField('category', e)}
                  >
                    <Text style={styles.catBtnEmoji}>{e}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.catRemove} onPress={() => handleRemoveCat(e)}>
                    <Text style={styles.catRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {addingCat ? (
                <View style={styles.catAddRow}>
                  <TextInput style={styles.catAddInput} value={newCatInput} onChangeText={setNewCatInput} placeholder="emoji" maxLength={4} autoFocus />
                  <TouchableOpacity style={styles.catConfirmBtn} onPress={handleAddCat}>
                    <Text style={styles.catConfirmText}>✓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.catAddBtn} onPress={() => setAddingCat(true)}>
                  <Text style={styles.catAddBtnText}>+</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>消費項目 *</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setField('title', v)} placeholder="例：晚餐" placeholderTextColor={Colors.textLight} />

            <View style={styles.amtRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>金額 *</Text>
                <TextInput style={styles.input} value={form.amount} onChangeText={(v) => setField('amount', v)} placeholder="1200" placeholderTextColor={Colors.textLight} keyboardType="numeric" />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>幣別</Text>
                {Platform.OS === 'web' ? (
                  <select value={form.currency} onChange={(e: any) => setField('currency', e.target.value)} style={webSelectStyle}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <TextInput style={styles.input} value={form.currency} onChangeText={(v) => setField('currency', v.toUpperCase())} placeholder="TWD" placeholderTextColor={Colors.textLight} autoCapitalize="characters" maxLength={3} />
                )}
              </View>
            </View>

            <Text style={styles.label}>付款人</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {members.map((m) => (
                  <TouchableOpacity key={m.id} style={[styles.chip, form.paidBy === m.display_name && styles.chipSelected]} onPress={() => setField('paidBy', m.display_name)}>
                    <Text style={{ fontSize: 13 }}>{m.avatar_emoji}</Text>
                    <Text style={[styles.chipText, form.paidBy === m.display_name && { color: '#fff' }]}>{m.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>共同消費人（可複選）</Text>
            <View style={styles.sharedGrid}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.sharedChip, form.sharedWith.includes(m.display_name) && styles.sharedChipSelected]}
                  onPress={() => toggleShared(m.display_name)}
                >
                  <Text>{m.avatar_emoji}</Text>
                  <Text style={[styles.chipText, form.sharedWith.includes(m.display_name) && { color: '#fff' }]}>{m.display_name}</Text>
                  {form.sharedWith.includes(m.display_name) && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            {form.sharedWith.length > 0 && form.amount && (
              <Text style={styles.splitPreview}>
                每人 NT${Math.round(parseFloat(form.amount) * (EXCHANGE_RATES[form.currency] ?? 1) / form.sharedWith.length).toLocaleString()}
              </Text>
            )}

            <Text style={styles.label}>付款方式</Text>
            <View style={styles.payRow}>
              {(['card', 'cash'] as const).map((m) => (
                <TouchableOpacity key={m} style={[styles.payBtn, form.payMethod === m && styles.payBtnSelected]} onPress={() => setField('payMethod', m)}>
                  <Text style={[styles.payBtnText, form.payMethod === m && { color: '#fff' }]}>{m === 'card' ? '💳 刷卡' : '💵 現金'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>日期</Text>
            <TextInput style={styles.input} value={form.date} onChangeText={(v) => setField('date', v)} placeholder="2026-04-23" placeholderTextColor={Colors.textLight} />

            <Text style={styles.label}>備註（選填）</Text>
            <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]} value={form.note} onChangeText={(v) => setField('note', v)} placeholder="補充說明..." placeholderTextColor={Colors.textLight} multiline />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>{editingExpense ? '儲存' : '新增'}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  totalCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, backgroundColor: Colors.accent, padding: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 2 },
  totalAmount: { color: '#fff', fontSize: 30, fontWeight: '700' },
  totalSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  splitToggle: { alignItems: 'center', gap: 4, marginLeft: 12 },
  splitToggleText: { color: '#fff', fontSize: 11 },
  splitCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.card, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  splitTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 10 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  splitName: { fontSize: 14, fontWeight: '600', color: Colors.text, width: 60 },
  splitDetail: { fontSize: 11, color: Colors.textSecondary },
  splitNet: { fontSize: 14, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  netPositive: { color: Colors.success },
  netNegative: { color: Colors.danger },
  netZero: { color: Colors.textSecondary },
  splitHint: { fontSize: 10, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  settleDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  settleTitle: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  settleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  settleFrom: { fontSize: 13, color: Colors.danger, fontWeight: '600', minWidth: 50 },
  settleArrow: { fontSize: 14, color: Colors.textLight },
  settleTo: { fontSize: 13, color: Colors.success, fontWeight: '600', flex: 1 },
  settleAmt: { fontSize: 14, fontWeight: '700', color: Colors.text },
  filterScroll: { maxHeight: 48, marginBottom: 6 },
  filterRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, color: Colors.textSecondary },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 100 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 12 },
  dateText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  dateTotalText: { fontSize: 12, color: Colors.textSecondary },
  expenseCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  expenseCardExpanded: { borderWidth: 1, borderColor: Colors.primaryLight },
  expenseCollapsed: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catEmoji: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  expenseLeft: { flex: 1 },
  expenseTitle: { fontSize: 15, fontWeight: '500', color: Colors.text },
  expenseShared: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: 14, fontWeight: '600', color: Colors.text },
  perPerson: { fontSize: 11, color: Colors.primary, marginTop: 2 },
  expenseDetail: { marginTop: 4 },
  detailDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailItem: { width: '47%' },
  detailLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  detailValue: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  splitDetail2: { marginTop: 10 },
  splitPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  splitPersonChip: { backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  splitPersonName: { fontSize: 12, color: Colors.text, fontWeight: '500' },
  splitPersonAmt: { fontSize: 11, color: Colors.primary },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'flex-end' },
  btnEmoji: { fontSize: 13 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.primaryLight },
  editBtnText: { color: Colors.primary, fontSize: 13 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FEE2E2' },
  deleteBtnText: { color: Colors.danger, fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: Colors.textLight, marginTop: 6 },
  ownerNote: { textAlign: 'center', fontSize: 12, color: Colors.textSecondary, paddingVertical: 8 },
  fab: { position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  catBtnWrap: { position: 'relative' },
  catBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  catBtnEmoji: { fontSize: 24 },
  catBtnSelected: { backgroundColor: Colors.primaryLight, borderWidth: 2, borderColor: Colors.primary },
  catRemove: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, justifyContent: 'center', alignItems: 'center' },
  catRemoveText: { color: '#fff', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  catAddBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  catAddBtnText: { fontSize: 22, color: Colors.textSecondary },
  catAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catAddInput: { width: 56, height: 48, backgroundColor: Colors.background, borderRadius: 12, textAlign: 'center', fontSize: 20, color: Colors.text, borderWidth: 1, borderColor: Colors.primary },
  catConfirmBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  catConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  amtRow: { flexDirection: 'row', alignItems: 'flex-end' },
  currencyBtn: { paddingHorizontal: 10, height: 46, borderRadius: 10, backgroundColor: Colors.background, marginRight: 6, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center', minWidth: 46 },
  currencyBtnSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary },
  sharedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sharedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  sharedChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  splitPreview: { color: Colors.primary, fontSize: 13, fontWeight: '600', marginTop: 6 },
  payRow: { flexDirection: 'row', gap: 10 },
  payBtn: { flex: 1, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  payBtnSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  payBtnText: { fontSize: 14, color: Colors.text },
  modalBtns: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontSize: 16 },
  createBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary },
  createText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
