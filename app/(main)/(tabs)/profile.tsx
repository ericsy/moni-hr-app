import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getActiveStore, useAuth } from '../../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../../src/hooks/useRefreshOnAppForeground';
import { colors } from '../../../src/theme/colors';
import { getUserRoleTitle } from '../../../src/utils/userRoleDisplay';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session, logout, setLanguage, language, updateProfile, refreshCurrentEmployee } = useAuth();
  const user = session?.user;
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email);
    setPhone(user.phone);
  }, [user?.email, user?.phone, user?.id]);

  const refreshPageData = useCallback(async () => {
    const res = await refreshCurrentEmployee();
    if (!res.ok && res.message) {
      Alert.alert(t('profileTitle'), res.message);
    }
  }, [refreshCurrentEmployee, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshPageData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshPageData]);

  useRefreshOnAppForeground(refreshPageData);

  const confirmLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  if (!user) {
    return null;
  }

  const apiRoleTitle = getUserRoleTitle(user, language);
  const roleLabel =
    apiRoleTitle || (user.role === 'manager' ? t('roleManager') : t('roleStaff'));

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('profileTitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.meta}>
            {t('employeeId')}: {user.employeeId}
          </Text>
          <Text style={styles.meta}>
            {t('phone')}: {user.phone || '—'}
          </Text>
          <Text style={styles.meta}>
            {t('store')}: {getActiveStore(user)?.name}
            {user.stores.length > 1 ? ` · ${user.stores.length}` : ''}
          </Text>
          <Text style={styles.meta}>
            {t('role')}: {roleLabel}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('email')}</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            onEndEditing={(e) => updateProfile({ email: e.nativeEvent.text.trim() })}
            style={styles.input}
            value={email}
          />

          <Text style={[styles.section, { marginTop: 12 }]}>{t('phone')}</Text>
          <TextInput
            keyboardType="phone-pad"
            onChangeText={setPhone}
            onEndEditing={(e) => updateProfile({ phone: e.nativeEvent.text.trim() })}
            style={styles.input}
            value={phone}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('language')}</Text>
          <View style={styles.langRow}>
            <Pressable
              onPress={() => void setLanguage('en')}
              style={[styles.langChip, language === 'en' && styles.langOn]}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextOn]}>{t('langEn')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void setLanguage('zh')}
              style={[styles.langChip, language === 'zh' && styles.langOn]}
            >
              <Text style={[styles.langText, language === 'zh' && styles.langTextOn]}>{t('langZh')}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => router.push('/change-password')} style={styles.linkCard}>
          <Text style={styles.linkText}>{t('changePassword')}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable onPress={confirmLogout} style={styles.logout}>
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 4, flexShrink: 0 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  scroll: { paddingTop: 4 },
  card: {
    marginTop: 14,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 20, fontWeight: '900', color: colors.text },
  meta: { marginTop: 8, color: colors.textMuted, fontSize: 13 },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  langRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  langChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: '#FAFBFD',
  },
  langOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  langText: { fontWeight: '800', color: colors.textMuted },
  langTextOn: { color: colors.primaryDark },
  linkCard: {
    marginTop: 12,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: { fontSize: 15, fontWeight: '800', color: colors.text },
  chev: { fontSize: 22, color: colors.textMuted, fontWeight: '700' },
  logout: {
    marginTop: 14,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontWeight: '900' },
});
