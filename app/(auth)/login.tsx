import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const signIn = useAuthStore((s) => s.signIn);

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('請填寫電子郵件和密碼');
      return;
    }
    setLoading(true);
    const error = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setErrorMsg(error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.emoji}>✈️</Text>
        <Text style={styles.title}>旅遊小幫手</Text>
        <Text style={styles.subtitle}>規劃你的完美旅程</Text>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {errorMsg}</Text>
          </View>
        ) : null}

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
          placeholder="密碼"
          placeholderTextColor={Colors.textLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>登入</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.link}>還沒有帳號？立即註冊</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: { fontSize: 60, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginBottom: 40 },
  errorBox: {
    width: '100%', backgroundColor: '#FEE2E2', borderRadius: 12,
    padding: 12, marginBottom: 12,
  },
  errorText: { color: Colors.danger, fontSize: 14 },
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
