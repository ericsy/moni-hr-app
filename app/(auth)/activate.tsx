import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, router } from 'expo-router';
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
import { BrandLogo } from '../../src/components/BrandLogo';
import { colors } from '../../src/theme/colors';

const DEFAULT_RETRY_SECONDS = 60;

export default function ActivateScreen() {
  const { t } = useTranslation();
  const { activateAccount, language, sendActivationCode, session, setLanguage } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => {
      setRetrySeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

  if (session?.user.activated) {
    return <Redirect href="/schedule" />;
  }

  const startRetryCountdown = (seconds: number) => {
    setRetrySeconds(Math.max(1, seconds));
  };

  const onSendCode = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('activateErrorEmail'));
      return;
    }
    setSendingCode(true);
    const res = await sendActivationCode(email);
    setSendingCode(false);
    if (!res.ok) {
      if (res.error === 'rate_limit') {
        startRetryCountdown(res.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
        setError(res.message ?? t('activateSendTooSoon'));
        return;
      }
      if (res.error === 'empty_email') {
        setError(t('activateErrorEmail'));
        return;
      }
      setError(res.message ?? t('activateSendFailed'));
      return;
    }
    startRetryCountdown(res.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
    setInfo(t('activateCodeSent'));
  };

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await activateAccount(email, code, password);
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'empty_email') {
        setError(t('activateErrorEmail'));
      } else if (res.error === 'invalid_code') {
        setError(t('activateErrorCode'));
      } else if (res.error === 'invalid_password') {
        setError(t('activateErrorPassword'));
      } else {
        setError(res.message ?? t('activateFailed'));
      }
      return;
    }
    router.replace('/schedule');
  };

  const sendDisabled = sendingCode || retrySeconds > 0 || busy;

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
                <BrandLogo size={56} style={styles.brandLogo} />
                <Text style={styles.brand}>{t('brand')}</Text>
                <Text style={styles.cardSubtitle}>{t('activateTitle')}</Text>
                <Text style={styles.cardHint}>{t('activateSubtitle')}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.field}>
                <Text style={styles.label}>{t('account')}</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder={t('accountHint')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>

              <Pressable
                disabled={sendDisabled}
                onPress={() => void onSendCode()}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.secondaryPressed,
                  sendDisabled && styles.disabled,
                ]}
              >
                <Text style={styles.secondaryLabel}>
                  {sendingCode
                    ? '…'
                    : retrySeconds > 0
                      ? t('sendActivationCodeWait', { seconds: retrySeconds })
                      : t('sendActivationCode')}
                </Text>
              </Pressable>

              <View style={styles.field}>
                <Text style={styles.label}>{t('activateCode')}</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 4))}
                  placeholder={t('activateCodeHint')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('activatePassword')}</Text>
                <TextInput
                  onChangeText={setPassword}
                  placeholder={t('activatePasswordHint')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={password}
                />
              </View>

              {info ? <Text style={styles.info}>{info}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                disabled={busy}
                onPress={() => void onSubmit()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryPressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.primaryLabel}>{busy ? '…' : t('activateSubmit')}</Text>
              </Pressable>

              <View style={styles.cardFooter}>
                <Link href="/login">
                  <Text style={styles.linkText}>{t('activateBackToLogin')}</Text>
                </Link>
              </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  langPillOn: { backgroundColor: colors.primarySoft },
  langPillText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  langPillTextOn: { color: colors.primaryDark },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24 },
  page: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHeader: { alignItems: 'center', marginBottom: 4 },
  brandLogo: {
    marginBottom: 10,
  },
  brand: { fontSize: 22, fontWeight: '800', color: colors.text },
  cardSubtitle: { marginTop: 4, fontSize: 16, fontWeight: '600', color: colors.text },
  cardHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
  field: { marginBottom: 12 },
  label: { marginBottom: 6, fontSize: 13, color: colors.textMuted, fontWeight: '500' },
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
  secondaryBtn: {
    marginBottom: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  secondaryPressed: { opacity: 0.85 },
  secondaryLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '600' },
  info: { color: colors.success, marginTop: 4, marginBottom: 4, fontSize: 13 },
  error: { color: colors.danger, marginTop: 4, marginBottom: 4, fontSize: 13 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  disabled: { opacity: 0.6 },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardFooter: { marginTop: 16, alignItems: 'center' },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
