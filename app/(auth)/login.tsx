import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [account, setAccount] = useState('demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const res = await login(account, password);
    setBusy(false);
    if (!res.ok) {
      setError(t('loginErrorEmpty'));
      return;
    }
    const normalized = account.trim().toLowerCase();
    if (normalized === 'activate') {
      router.replace('/activate');
    } else {
      router.replace('/schedule');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.hero}>
          <View style={styles.accent} />
          <Text style={styles.brand}>{t('brand')}</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('loginTitle')}</Text>

          <Text style={styles.label}>{t('account')}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAccount}
            placeholder={t('accountHint')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={account}
          />

          <Text style={styles.label}>{t('password')}</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={busy}
            onPress={onSubmit}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed, busy && styles.disabled]}
          >
            <Text style={styles.primaryLabel}>{busy ? '…' : t('signIn')}</Text>
          </Pressable>

          <Link href="/activate" style={styles.link}>
            <Text style={styles.linkText}>{t('activateLink')}</Text>
          </Link>

          <Text style={styles.demo}>{t('loginDemo')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, paddingHorizontal: 20 },
  hero: { marginTop: 12, marginBottom: 20 },
  accent: {
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  brand: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 0.4 },
  tagline: { marginTop: 8, color: colors.textMuted, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  label: { marginTop: 8, fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  disabled: { opacity: 0.6 },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { color: colors.primary, fontWeight: '600' },
  demo: { marginTop: 16, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
