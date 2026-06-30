import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { clearRememberLogin, loadRememberLogin, saveRememberLogin } from '../../src/utils/rememberLogin';

type LoginStep = 'email' | 'password';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { checkAccountStatus, login, language, setLanguage } = useAuth();
  const [step, setStep] = useState<LoginStep>('email');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const accountWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);

  const {
    scrollRef,
    contentRef,
    scrollYRef,
    keyboardHeight,
    onFieldFocus,
    onScrollViewLayout,
    scrollContentPaddingBottom,
  } = useScrollInputAboveKeyboard({ bottomGap: 32 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadRememberLogin();
      if (cancelled) return;
      if (saved) {
        setAccount(saved.email);
        setPassword(saved.password);
        setRememberMe(true);
        setStep('password');
      }
      setCredentialsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onNext = async () => {
    const email = account.trim();
    if (!email) {
      setError(t('loginErrorEmailEmpty'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await checkAccountStatus(email);
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'empty_email') {
        setError(t('loginErrorEmailEmpty'));
      } else {
        setError(res.message ?? t('loginErrorFailed'));
      }
      return;
    }
    if (res.status === 'not_found') {
      setError(t('loginAccountNotFound'));
      return;
    }
    if (res.status === 'needs_activation') {
      router.push({ pathname: '/activate', params: { email } });
      return;
    }
    setStep('password');
  };

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

  const onBackToEmail = () => {
    setStep('email');
    setError(null);
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
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardHeight > 0 && styles.scrollContentKeyboardOpen,
            { paddingBottom: scrollContentPaddingBottom },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onLayout={onScrollViewLayout}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View ref={contentRef} collapsable={false} style={styles.page}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <BrandLogo size={64} style={styles.brandLogo} />
                <Text style={styles.brand}>{t('brand')}</Text>
                <Text style={styles.cardSubtitle}>{t('loginTitle')}</Text>
                {step === 'password' ? (
                  <Text style={styles.cardHint}>{t('loginPasswordStepHint')}</Text>
                ) : null}
              </View>

              <View style={styles.divider} />

              {step === 'email' ? (
                <>
                  <View ref={accountWrapRef} collapsable={false} style={styles.field}>
                    <Text style={styles.label}>{t('account')}</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus={credentialsReady}
                      keyboardType="email-address"
                      textContentType="username"
                      onChangeText={setAccount}
                      onFocus={() => onFieldFocus(accountWrapRef)}
                      onSubmitEditing={() => void onNext()}
                      placeholder={t('accountHint')}
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="next"
                      style={styles.input}
                      value={account}
                    />
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <Pressable
                    disabled={busy}
                    onPress={() => void onNext()}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.primaryPressed,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryLabel}>{busy ? '…' : t('loginNext')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.emailSummary}>
                    <Text style={styles.emailSummaryLabel}>{t('account')}</Text>
                    <Text style={styles.emailSummaryValue}>{account.trim()}</Text>
                    <Pressable accessibilityRole="button" onPress={onBackToEmail}>
                      <Text style={styles.changeEmailLink}>{t('loginChangeEmail')}</Text>
                    </Pressable>
                  </View>

                  <View ref={passwordWrapRef} collapsable={false} style={styles.field}>
                    <Text style={styles.label}>{t('password')}</Text>
                    <TextInput
                      autoFocus
                      onChangeText={setPassword}
                      onFocus={() => onFieldFocus(passwordWrapRef)}
                      onSubmitEditing={() => void onSubmit()}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="go"
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
                    onPress={() => void onSubmit()}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.primaryPressed,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryLabel}>{busy ? '…' : t('signIn')}</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.cardFooter}>
                <Link href="/forgot-password">
                  <Text style={styles.linkText}>{t('forgotPasswordLink')}</Text>
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
  scrollContentKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 12,
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
  brandLogo: {
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
  cardHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
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
  emailSummary: {
    marginBottom: 14,
    gap: 4,
  },
  emailSummaryLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  emailSummaryValue: { fontSize: 16, color: colors.text, fontWeight: '600' },
  changeEmailLink: {
    marginTop: 4,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    alignSelf: 'flex-start',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 20,
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
