import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CurrentPunchAction } from '../../types/fieldService';
import { colors } from '../../theme/colors';
import { formatWorkPunchHint, formatWorkPunchTitle } from '../../utils/workPunch';

type Props = {
  action: CurrentPunchAction;
  busy?: boolean;
  onPress: () => void | Promise<void>;
};

function isActionEnabled(action: CurrentPunchAction): boolean {
  if (action.action === 'WAITING' || action.action === 'DONE') return false;
  return !!action.refType && !!action.refId;
}

export function TodayPunchActionButton({ action, busy = false, onPress }: Props) {
  const { t } = useTranslation();
  const enabled = isActionEnabled(action);
  const actionTitle = formatWorkPunchTitle(action, t);
  const hint = formatWorkPunchHint(action, t);

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons color="#fff" name={enabled ? 'finger-print-outline' : 'time-outline'} size={26} />
        </View>
        <Text style={styles.title}>{actionTitle}</Text>
        {hint ? <Text style={styles.subtitle}>{hint}</Text> : null}
      </View>
      {enabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionTitle}
          disabled={busy}
          onPress={() => void onPress()}
          style={({ pressed }) => [styles.btn, busy && styles.btnDisabled, pressed && !busy && styles.btnPressed]}
        >
          <View style={styles.btnCircle}>
            {busy ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Ionicons color={colors.text} name="finger-print" size={32} />
            )}
          </View>
          <Text style={styles.btnText}>{t('todayActionPunchNow')}</Text>
        </Pressable>
      ) : (
        <View style={styles.btn}>
          <View style={[styles.btnCircle, styles.btnCircleDisabled]}>
            <Ionicons color={action.action === 'DONE' ? colors.success : colors.textMuted} name="checkmark-circle" size={34} />
          </View>
          <Text style={styles.btnText}>{action.action === 'DONE' ? t('todayActionDone') : t('todayActionWaiting')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: colors.primary,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 136,
  },
  left: { flex: 1, minWidth: 0 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { marginTop: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },
  btn: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCircleDisabled: { backgroundColor: '#fff' },
  btnText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
