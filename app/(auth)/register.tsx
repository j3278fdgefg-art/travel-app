import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const signUp = useAuthStore((s) => s.signUp);

  const handleRegister = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!name || !email || !password) {
      setErrorMsg('請填寫所有欄位');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('密碼至少需要 6 個字元');
      return;
    }
    setLoading(true);
    const error = await signUp(email.trim(), password, name.trim());
    setLoading(false);
    if (error) {
      setErrorMsg(error);
    } else {
      setSuccessMsg('註冊成功！正在跳轉到登入頁...');
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.emoji}>🗺️</Text>
        <Text style={styles.title}>建立帳號</Text>
        <Text style={styles.subtitle}>開始規劃你的旅程</Text>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {errorMsg}</Text>
          </View>
        ) : null}

        {successMsg ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✅ {successMsg}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="你的名字"
          placeholderTextColor={Colors.textLight}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="電子郵件"
          placeholderTextColor={Colors.textLight}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="密碼（至少 6 個字元）"
          placeholderTextColor={Colors.textLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>註冊</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.link}>已有帳號？返回登入</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingVertical: 40,
  },
  emoji: { fontSize: 60, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginBottom: 40 },
  errorBox: {
    width: '100%', backgroundColor: '#FEE2E2', borderRadius: 12,
    padding: 12, marginBottom: 12,
  },
  errorText: { color: Colors.danger, fontSize: 14 },
  successBox: {
    width: '100%', backgroundColor: '#D1FAE5', borderRadius: 12,
    padding: 12, marginBottom: 12,
  },
  successText: { color: Colors.success, fontSize: 14 },
  input: {
    width: '100%', height: 52, backgroundColor: Colors.card,
    borderRadius: 14, paddingHorizontal: 16, fontSize: 16,
    color: Colors.text, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  btn: {
    width: '100%', height: 52, backgroundColor: Colors.primary,
    borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    marginTop: 8, marginBottom: 20,
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { color: Colors.primary, fontSize: 15, fontWeight: '500' },
});
