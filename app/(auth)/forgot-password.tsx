import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
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
import { useScrollInputAboveKeyboard } from '../../src/hooks/useScrollInputAboveKeyboard';
import { colors } from '../../src/theme/colors';

const DEFAULT_RETRY_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { language, resetPasswordWithCode, sendPasswordResetCode, setLanguage } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  const emailWrapRef = useRef<View>(null);
  const codeWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);

  const {
    scrollRef,
    contentRef,
    scrollYRef,
    keyboardHeight,
    onFieldFocus,
    scrollContentPaddingBottom,
  } = useScrollInputAboveKeyboard({ topChrome: 44 });

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => {
      setRetrySeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

  const startRetryCountdown = (seconds: number) => {
    setRetrySeconds(Math.max(1, seconds));
  };

  const onSendCode = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('forgotErrorEmail'));
      return;
    }
    setSendingCode(true);
    const res = await sendPasswordResetCode(email);
    setSendingCode(false);
    if (!res.ok) {
      if (res.error === 'rate_limit') {
        startRetryCountdown(res.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
        setError(res.message ?? t('forgotSendTooSoon'));
        return;
      }
      if (res.error === 'empty_email') {
        setError(t('forgotErrorEmail'));
        return;
      }
      setError(res.message ?? t('forgotSendFailed'));
      return;
    }
    startRetryCountdown(res.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
    setInfo(t('forgotCodeSent'));
  };

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await resetPasswordWithCode(email, code, password);
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'empty_email') {
        setError(t('forgotErrorEmail'));
      } else if (res.error === 'invalid_code') {
        setError(t('forgotErrorCode'));
      } else if (res.error === 'invalid_password') {
        setError(t('forgotErrorPassword'));
      } else {
        setError(res.message ?? t('forgotFailed'));
      }
      return;
    }
    Alert.alert(t('forgotTitle'), t('forgotSuccess'), [
      { text: 'OK', onPress: () => router.replace('/login') },
    ]);
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
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardHeight > 0 && styles.scrollContentKeyboardOpen,
            { paddingBottom: scrollContentPaddingBottom },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View ref={contentRef} collapsable={false}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <BrandLogo size={56} style={styles.brandLogo} />
                <Text style={styles.brand}>{t('brand')}</Text>
                <Text style={styles.cardSubtitle}>{t('forgotTitle')}</Text>
                <Text style={styles.cardHint}>{t('forgotSubtitle')}</Text>
              </View>

              <View style={styles.divider} />

              <View ref={emailWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('account')}</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onFocus={() => onFieldFocus(emailWrapRef)}
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
                      : t('sendResetCode')}
                </Text>
              </Pressable>

              <View ref={codeWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('forgotCode')}</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 4))}
                  onFocus={() => onFieldFocus(codeWrapRef)}
                  placeholder={t('forgotCodeHint')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>

              <View ref={passwordWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('forgotNewPassword')}</Text>
                <TextInput
                  onChangeText={setPassword}
                  onFocus={() => onFieldFocus(passwordWrapRef)}
                  placeholder={t('forgotNewPasswordHint')}
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
                <Text style={styles.primaryLabel}>{busy ? '…' : t('forgotSubmit')}</Text>
              </Pressable>

              <View style={styles.cardFooter}>
                <Link href="/login">
                  <Text style={styles.linkText}>{t('forgotBackToLogin')}</Text>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  scrollContentKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
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
