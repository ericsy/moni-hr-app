import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import type { AppUpdateState } from '../hooks/useAppUpdate';

type Props = {
  state: AppUpdateState | null;
  onUpdate: () => void;
  onDismiss?: () => void;
};

export function AppUpdateModal({ state, onUpdate, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const visible = state?.visible ?? false;
  const forceUpdate = state?.forceUpdate ?? false;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={forceUpdate ? undefined : onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.title}>
            {forceUpdate ? t('appUpdateForceTitle') : t('appUpdateOptionalTitle')}
          </Text>
          {state?.latestVersion ? (
            <Text style={styles.version}>
              {t('appUpdateVersion', { version: state.latestVersion })}
            </Text>
          ) : null}
          {state?.releaseNotes ? (
            <ScrollView style={styles.notesScroll} contentContainerStyle={styles.notesContent}>
              <Text style={styles.notes}>{state.releaseNotes}</Text>
            </ScrollView>
          ) : (
            <Text style={styles.hint}>
              {forceUpdate ? t('appUpdateForceHint') : t('appUpdateOptionalHint')}
            </Text>
          )}
          <Pressable style={styles.primaryBtn} onPress={onUpdate}>
            <Text style={styles.primaryBtnText}>{t('appUpdateGoStore')}</Text>
          </Pressable>
          {!forceUpdate ? (
            <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
              <Text style={styles.secondaryBtnText}>{t('appUpdateLater')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 10,
  },
  notesScroll: {
    maxHeight: 160,
    marginBottom: 16,
  },
  notesContent: {
    paddingBottom: 4,
  },
  notes: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
