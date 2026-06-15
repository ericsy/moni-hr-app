import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { getApproximateServerNowDate } from '../utils/serverClock';
import {
  formatShiftEndHm,
  formatShiftStartHm,
  minutesUntilShiftStart,
} from '../utils/scheduleHeroShift';
import { getShiftCardActions } from '../utils/shiftClockWindow';

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
  const { t } = useTranslation();
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
  const isClockOut = actions.showClockOut;
  const title = isClockOut ? t('punchHeroClockOut') : t('punchHeroClockIn');
  const timeLabel = isClockOut ? formatShiftEndHm(slot.range) : formatShiftStartHm(slot.range);
  const minutesLeft = !isClockOut ? minutesUntilShiftStart(slot.range, now) : null;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.clockIconWrap}>
          <Ionicons color="#fff" name="time-outline" size={28} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {isClockOut ? t('punchHeroEndTime', { time: timeLabel }) : t('punchHeroStartTime', { time: timeLabel })}
        </Text>
        {minutesLeft != null ? (
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>{t('minutesUntilShift', { count: minutesLeft })}</Text>
          </View>
        ) : null}
      </View>
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
  punchBtnText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
