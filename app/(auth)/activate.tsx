import { Redirect, router } from 'expo-router';
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

export default function ActivateScreen() {
  const { t } = useTranslation();
  const { activateAccount, session, logout } = useAuth();

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (session.user.activated) {
    return <Redirect href="/schedule" />;
  }
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const res = await activateAccount(code);
    setBusy(false);
    if (!res.ok) {
      setError(t('activateErrorEmpty'));
      return;
    }
    router.replace('/schedule');
  };

  const onBack = async () => {
    if (session?.user.activated) {
      router.replace('/schedule');
      return;
    }
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Pressable hitSlop={12} onPress={() => void onBack()} style={styles.back}>
          <Text style={styles.backText}>‹ {t('cancel')}</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.accent} />
          <Text style={styles.title}>{t('activateTitle')}</Text>
          <Text style={styles.subtitle}>{t('activateSubtitle')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('inviteCode')}</Text>
          <TextInput
            autoCapitalize="characters"
            onChangeText={setCode}
            placeholder="INV-2026"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={code}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={busy}
            onPress={onSubmit}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed, busy && styles.disabled]}
          >
            <Text style={styles.primaryLabel}>{busy ? '…' : t('submit')}</Text>
          </Pressable>

          <Text style={styles.demo}>{t('activateDemo')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, paddingHorizontal: 20 },
  back: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  hero: { marginTop: 8, marginBottom: 20 },
  accent: {
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 8, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  label: { marginTop: 4, fontSize: 13, color: colors.textMuted, fontWeight: '500' },
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
  demo: { marginTop: 16, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
