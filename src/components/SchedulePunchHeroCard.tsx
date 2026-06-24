import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { formatPunchHm } from '../utils/formatPunchTime';
import { getApproximateServerNowDate } from '../utils/serverClock';
import {
  formatShiftEndHm,
  formatShiftStartHm,
  minutesUntilShiftStart,
} from '../utils/scheduleHeroShift';
import { getShiftCardActions } from '../utils/shiftClockWindow';

type HeroDisplayMode = 'clock_in' | 'clock_out' | 'clocked_in' | 'completed' | 'idle';

function resolveClockInIso(
  punch: ShiftPunchRecord | undefined,
  pairPunch: ShiftPunchRecord | undefined,
  overnightRole: MyPublishedShiftSlot['overnightRole'],
): string | undefined {
  if (overnightRole === 'end') return pairPunch?.clockInAt ?? punch?.clockInAt;
  return punch?.clockInAt;
}

function resolveHeroDisplayMode(
  actions: ReturnType<typeof getShiftCardActions>,
  clockInIso: string | undefined,
  clockOutIso: string | undefined,
): HeroDisplayMode {
  if (actions.showClockOut) return 'clock_out';
  if (actions.showClockIn) return 'clock_in';
  if (actions.statusKey === 'shiftStatusCompleted' || (clockInIso && clockOutIso)) {
    return 'completed';
  }
  if (
    clockInIso &&
    (actions.statusKey === 'shiftStatusClockedInWaitEnd' ||
      actions.statusKey === 'shiftStatusClockedIn' ||
      actions.statusKey === 'shiftStatusPastIncomplete')
  ) {
    return 'clocked_in';
  }
  return 'idle';
}

type Props = {
  slot: MyPublishedShiftSlot;
  workDateIso: string;
  todayIso: string;
  punch?: ShiftPunchRecord;
  pairPunch?: ShiftPunchRecord;
  punchesKnown?: boolean;
  punchBusy?: boolean;
  onPunch: () => void | Promise<void>;
};

export function SchedulePunchHeroCard({
  slot,
  workDateIso,
  todayIso,
  punch,
  pairPunch,
  punchesKnown = false,
  punchBusy,
  onPunch,
}: Props) {
  const { t, i18n } = useTranslation();
  const now = getApproximateServerNowDate();
  const actions = getShiftCardActions(
    workDateIso,
    slot.range,
    punch,
    todayIso,
    now,
    punchesKnown,
    slot.overnightRole ?? 'normal',
    pairPunch,
  );

  const canPunch = actions.showClockIn || actions.showClockOut;
  const overnightRole = slot.overnightRole ?? 'normal';
  const clockInIso = resolveClockInIso(punch, pairPunch, overnightRole);
  const clockOutIso = punch?.clockOutAt;
  const heroMode = resolveHeroDisplayMode(actions, clockInIso, clockOutIso);

  const isClockOut = heroMode === 'clock_out';
  const title =
    heroMode === 'completed'
      ? t('shiftBadgeCompleted')
      : heroMode === 'clocked_in'
        ? t('shiftBadgeClockedIn')
        : isClockOut
          ? t('punchHeroClockOut')
          : t('punchHeroClockIn');
  const timeLabel = isClockOut ? formatShiftEndHm(slot.range) : formatShiftStartHm(slot.range);
  const minutesLeft = heroMode === 'clock_in' ? minutesUntilShiftStart(slot.range, now) : null;
  const clockInLabel =
    heroMode === 'clocked_in' && clockInIso
      ? t('punchHeroClockedInAt', { time: formatPunchHm(clockInIso, i18n.language) })
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.clockIconWrap}>
          <Ionicons color="#fff" name="time-outline" size={28} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {heroMode === 'clocked_in' && clockInLabel ? (
          <Text style={styles.subtitle}>{clockInLabel}</Text>
        ) : heroMode === 'completed' ? (
          <Text style={styles.subtitle}>
            {clockInIso && clockOutIso
              ? `${formatPunchHm(clockInIso, i18n.language)} – ${formatPunchHm(clockOutIso, i18n.language)}`
              : t('punchHeroStartTime', { time: timeLabel })}
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            {isClockOut ? t('punchHeroEndTime', { time: timeLabel }) : t('punchHeroStartTime', { time: timeLabel })}
          </Text>
        )}
        {minutesLeft != null ? (
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>{t('minutesUntilShift', { count: minutesLeft })}</Text>
          </View>
        ) : null}
      </View>
      {heroMode === 'clocked_in' || heroMode === 'completed' ? (
        <View style={styles.punchBtn}>
          <View style={[styles.punchCircle, styles.punchCircleDone]}>
            <Ionicons color={colors.success} name="checkmark-circle" size={36} />
          </View>
          <Text style={styles.punchBtnText}>
            {heroMode === 'completed' ? t('shiftBadgeCompleted') : t('shiftBadgeClockedIn')}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={canPunch ? title : t('punchHeroUnavailable')}
          disabled={!canPunch || punchBusy}
          onPress={() => void onPunch()}
          style={({ pressed }) => [
            styles.punchBtn,
            (!canPunch || punchBusy) && styles.punchBtnDisabled,
            pressed && canPunch && !punchBusy && styles.punchBtnPressed,
          ]}
        >
          <View style={styles.punchCircle}>
            {punchBusy ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Ionicons color={colors.text} name="finger-print" size={32} />
            )}
          </View>
          <Text style={styles.punchBtnText}>{t('punchHeroNow')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 140,
  },
  left: { flex: 1, minWidth: 0 },
  clockIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { marginTop: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  countdownPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  countdownText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  punchBtn: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  punchBtnDisabled: { opacity: 0.45 },
  punchBtnPressed: { opacity: 0.85 },
  punchCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  punchCircleDone: { backgroundColor: '#fff' },
  punchBtnText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
