import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { useScrollInputAboveKeyboard } from '../../src/hooks/useScrollInputAboveKeyboard';
import { colors } from '../../src/theme/colors';

const DEFAULT_RETRY_SECONDS = 60;

type FocusedField = 'none' | 'email' | 'code' | 'password' | 'confirm';

const REVEAL_RETRY_MS = [80, 200, 400, 650, 900, 1100, 1300];
const CONFIRM_RETRY_MS = [100, 300, 550, 800, 1000];

/**
 * 聚焦某字段时，保证 reveal 所指下一项完整露在键盘上方。
 * 邮箱→激活码，激活码→登录密码，登录密码→确认密码，确认密码→激活按钮
 */
const FIELD_SCROLL = {
  email: { reveal: 'code' as const, revealMargin: 56, paddingMin: 200, paddingRatio: 0.55 },
  code: { reveal: 'password' as const, revealMargin: 96, paddingMin: 280, paddingRatio: 0.68 },
  password: { reveal: 'confirm' as const, revealMargin: 112, paddingMin: 300, paddingRatio: 0.72 },
  confirm: { reveal: 'submit' as const, revealMargin: 80, paddingMin: 280, paddingRatio: 0.85 },
};

export default function ActivateScreen() {
  const { t } = useTranslation();
  const { activateAccount, language, sendActivationCode, session, setLanguage } = useAuth();
  const params = useLocalSearchParams<{ email?: string | string[] }>();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const emailWrapRef = useRef<View>(null);
  const codeWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);
  const confirmPasswordWrapRef = useRef<View>(null);
  const submitBtnWrapRef = useRef<View>(null);
  const [focusedField, setFocusedField] = useState<FocusedField>('none');

  const revealRefs = {
    code: codeWrapRef,
    password: passwordWrapRef,
    confirm: confirmPasswordWrapRef,
    submit: submitBtnWrapRef,
  };

  const {
    scrollRef,
    contentRef,
    scrollYRef,
    keyboardOpen,
    keyboardHeight,
    onScrollViewLayout,
    scrollEnsureVisible,
    setRevealTarget,
    scrollToEnd,
    scrollContentPaddingBottom,
  } = useScrollInputAboveKeyboard({ bottomGap: 44, extraScroll: 0 });

  const scrollForField = (field: Exclude<FocusedField, 'none'>) => {
    const cfg = FIELD_SCROLL[field];
    const revealRef = revealRefs[cfg.reveal];
    const revealMargin = cfg.revealMargin;

    setRevealTarget(revealRef, revealMargin);

    const margins =
      field === 'password'
        ? [revealMargin, revealMargin + 48, revealMargin + 80]
        : [revealMargin, revealMargin + 28, revealMargin + 48];

    const run = () => {
      margins.forEach((m) => scrollEnsureVisible(revealRef, m));
    };
    run();

    const delays = field === 'confirm' ? CONFIRM_RETRY_MS : REVEAL_RETRY_MS;
    delays.forEach((ms) => {
      setTimeout(() => {
        run();
        if (field === 'confirm') {
          scrollToEnd(true);
        }
      }, ms);
    });
  };

  const focusEmail = () => {
    setFocusedField('email');
    requestAnimationFrame(() => scrollForField('email'));
  };

  const focusCode = () => {
    setFocusedField('code');
    requestAnimationFrame(() => scrollForField('code'));
  };

  const focusPassword = () => {
    setFocusedField('password');
    requestAnimationFrame(() => scrollForField('password'));
  };

  const focusConfirmPassword = () => {
    setFocusedField('confirm');
    requestAnimationFrame(() => scrollForField('confirm'));
  };

  const keyboardExtraPadding =
    focusedField !== 'none' && keyboardHeight > 0
      ? Math.max(FIELD_SCROLL[focusedField].paddingMin, keyboardHeight * FIELD_SCROLL[focusedField].paddingRatio)
      : 0;

  useEffect(() => {
    if (!keyboardOpen) {
      setFocusedField('none');
    }
  }, [keyboardOpen]);

  useLayoutEffect(() => {
    if (focusedField === 'none' || keyboardHeight <= 0) return;
    scrollForField(focusedField);
  }, [focusedField, keyboardHeight, keyboardExtraPadding]);

  useEffect(() => {
    if (focusedField === 'none' || keyboardHeight <= 0) return;
    const delays = focusedField === 'confirm' ? CONFIRM_RETRY_MS : REVEAL_RETRY_MS;
    const timers = delays.map((ms) => setTimeout(() => scrollForField(focusedField), ms));
    return () => timers.forEach(clearTimeout);
  }, [focusedField, keyboardHeight, keyboardExtraPadding]);

  useEffect(() => {
    const raw = params.email;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) {
      setEmail(value.trim());
    }
  }, [params.email]);

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
    setError(null);
    setInfo(null);

    if (password.length < 8) {
      setError(t('activateErrorPassword'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('activateErrorPasswordMismatch'));
      return;
    }

    setBusy(true);
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
        enabled={Platform.OS === 'ios'}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardOpen && styles.scrollContentKeyboardOpen,
            {
              paddingBottom: scrollContentPaddingBottom + keyboardExtraPadding,
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onLayout={onScrollViewLayout}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.flex}
        >
          <View ref={contentRef} collapsable={false} style={styles.page}>
            <View style={styles.card}>
              <View style={[styles.cardHeader, keyboardOpen && styles.cardHeaderCompact]}>
                {!keyboardOpen ? <BrandLogo size={56} style={styles.brandLogo} /> : null}
                {!keyboardOpen ? <Text style={styles.brand}>{t('brand')}</Text> : null}
                <Text style={styles.cardSubtitle}>{t('activateTitle')}</Text>
                {!keyboardOpen ? <Text style={styles.cardHint}>{t('activateSubtitle')}</Text> : null}
              </View>

              {!keyboardOpen ? <View style={styles.divider} /> : null}

              <View ref={emailWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('account')}</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onFocus={focusEmail}
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

              <View ref={codeWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('activateCode')}</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 4))}
                  onFocus={focusCode}
                  placeholder={t('activateCodeHint')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>

              <View ref={passwordWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('activatePassword')}</Text>
                <TextInput
                  onChangeText={setPassword}
                  onFocus={focusPassword}
                  placeholder={t('activatePasswordHint')}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={password}
                />
              </View>

              <View ref={confirmPasswordWrapRef} collapsable={false} style={styles.field}>
                <Text style={styles.label}>{t('activateConfirmPassword')}</Text>
                <TextInput
                  onChangeText={setConfirmPassword}
                  onFocus={focusConfirmPassword}
                  onSubmitEditing={() => void onSubmit()}
                  placeholder={t('activateConfirmPasswordHint')}
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </View>

              {info ? <Text style={styles.info}>{info}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View
                ref={submitBtnWrapRef}
                collapsable={false}
                style={focusedField === 'confirm' ? styles.submitWrapFocused : undefined}
              >
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
              </View>

              {!keyboardOpen ? (
                <View style={styles.cardFooter}>
                  <Link href="/login">
                    <Text style={styles.linkText}>{t('activateBackToLogin')}</Text>
                  </Link>
                </View>
              ) : null}
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
    paddingVertical: 28,
  },
  scrollContentKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  page: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
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
  cardHeaderCompact: { marginBottom: 0, paddingTop: 4 },
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
  submitWrapFocused: { paddingBottom: 16, marginBottom: 4 },
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
