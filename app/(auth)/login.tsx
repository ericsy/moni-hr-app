import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import { clearRememberLogin, loadRememberLogin, saveRememberLogin } from '../../src/utils/rememberLogin';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, language, setLanguage } = useAuth();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [credentialsReady, setCredentialsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadRememberLogin();
      if (cancelled) return;
      if (saved) {
        setAccount(saved.email);
        setPassword(saved.password);
        setRememberMe(true);
      }
      setCredentialsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const res = await login(account, password);
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'empty') {
        setError(t('loginErrorEmpty'));
      } else {
        setError(res.message ?? t('loginErrorFailed'));
      }
      return;
    }
    if (rememberMe) {
      await saveRememberLogin(account, password);
    } else {
      await clearRememberLogin();
    }
    router.replace('/schedule');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topGlow} pointerEvents="none" />
      <View style={styles.langBar}>
        <Ionicons color={colors.textMuted} name="language-outline" size={20} />
        <View style={styles.langToggle}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: language === 'en' }}
            onPress={() => void setLanguage('en')}
            style={[styles.langPill, language === 'en' && styles.langPillOn]}
          >
            <Text style={[styles.langPillText, language === 'en' && styles.langPillTextOn]}>{t('langEn')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: language === 'zh' }}
            onPress={() => void setLanguage('zh')}
            style={[styles.langPill, language === 'zh' && styles.langPillOn]}
          >
            <Text style={[styles.langPillText, language === 'zh' && styles.langPillTextOn]}>{t('langZh')}</Text>
          </Pressable>
        </View>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.logoCircle}>
                  <Ionicons color={colors.primaryDark} name="calendar-outline" size={30} />
                </View>
                <Text style={styles.brand}>{t('brand')}</Text>
                <Text style={styles.cardSubtitle}>{t('loginTitle')}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.field}>
                <Text style={styles.label}>{t('account')}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            onChangeText={setAccount}
                  placeholder={t('accountHint')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={account}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('password')}</Text>
                <TextInput
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  textContentType="password"
                  style={styles.input}
                  value={password}
                />
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                disabled={!credentialsReady}
                onPress={() => setRememberMe((v) => !v)}
                style={styles.rememberRow}
              >
                <Ionicons
                  color={rememberMe ? colors.primary : colors.textMuted}
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={22}
                />
                <Text style={styles.rememberText}>{t('rememberMe')}</Text>
              </Pressable>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                disabled={busy}
                onPress={onSubmit}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryPressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.primaryLabel}>{busy ? '…' : t('signIn')}</Text>
              </Pressable>

              <View style={styles.cardFooter}>
                <Link href="/activate">
                  <Text style={styles.linkText}>{t('activateLink')}</Text>
                </Link>
              </View>
            </View>

            <View style={styles.demoBox}>
              <Ionicons color={colors.textMuted} name="information-circle-outline" size={16} />
              <Text style={styles.demo}>{t('loginDemo')}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: colors.primarySoft,
    opacity: 0.55,
  },
  langBar: {
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 2,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  langPillOn: { backgroundColor: colors.primarySoft },
  langPillText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  langPillTextOn: { color: colors.primaryDark },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  page: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    gap: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHeader: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 20,
  },
  field: { gap: 8, marginBottom: 14 },
  label: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  rememberText: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, marginBottom: 12, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  disabled: { opacity: 0.6 },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardFooter: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  demoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  demo: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: '500' },
});
