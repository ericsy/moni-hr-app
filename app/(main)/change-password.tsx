import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import { loadRememberLogin, saveRememberLogin } from '../../src/utils/rememberLogin';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { changePassword, session } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    if (!oldPassword.trim() || !newPassword.trim() || !confirm.trim()) {
      Alert.alert(t('changePasswordTitle'), t('passwordFieldsRequired'));
      return;
    }
    if (newPassword.trim().length < 8) {
      Alert.alert(t('changePasswordTitle'), t('passwordMinLength'));
      return;
    }
    if (newPassword !== confirm) {
      Alert.alert(t('changePasswordTitle'), t('passwordMismatch'));
      return;
    }
    setBusy(true);
    const res = await changePassword(oldPassword, newPassword);
    setBusy(false);
    if (!res.ok) {
      Alert.alert(
        t('changePasswordTitle'),
        res.message ?? (res.error === 'empty' ? t('passwordFieldsRequired') : t('passwordChangeFailed')),
      );
      return;
    }
    const email = session?.user.email?.trim();
    if (email) {
      const saved = await loadRememberLogin();
      if (saved && saved.email.trim().toLowerCase() === email.toLowerCase()) {
        await saveRememberLogin(email, newPassword.trim());
      }
    }
    Alert.alert(t('changePasswordTitle'), t('passwordUpdated'), [
      { text: t('submit'), onPress: () => router.back() },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('changePasswordTitle'),
          headerBackTitle: t('profileTitle'),
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <View style={styles.body}>
          <Text style={styles.label}>{t('oldPassword')}</Text>
          <TextInput
            onChangeText={setOldPassword}
            secureTextEntry
            style={styles.input}
            value={oldPassword}
          />

          <Text style={styles.label}>{t('newPassword')}</Text>
          <TextInput
            onChangeText={setNewPassword}
            secureTextEntry
            style={styles.input}
            value={newPassword}
          />

          <Text style={styles.label}>{t('confirmPassword')}</Text>
          <TextInput onChangeText={setConfirm} secureTextEntry style={styles.input} value={confirm} />

          <Pressable
            disabled={busy}
            onPress={onSave}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.disabled]}
          >
            <Text style={styles.btnText}>{busy ? '…' : t('save')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, gap: 8 },
  label: { marginTop: 6, fontSize: 12, fontWeight: '800', color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPressed: { backgroundColor: colors.primaryDark },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
