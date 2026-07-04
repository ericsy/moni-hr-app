import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShiftPunchRecord } from '../context/AuthContext';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { CurrentPunchAction, TimelineFieldJobItem } from '../types/fieldService';
import { colors } from '../theme/colors';
import { StoreShiftIcon } from './icons/StoreShiftIcon';
import { formatPunchHm } from '../utils/formatPunchTime';
import { shouldShowFieldHeroInService } from '../utils/fieldMissedPunchEligibility';
import { getApproximateServerNowDate } from '../utils/serverClock';
import {
  formatShiftEndHm,
  formatShiftHeroName,
  formatShiftStartHm,
  minutesUntilShiftEnd,
  minutesUntilShiftStart,
} from '../utils/scheduleHeroShift';
import { getShiftCardActions } from '../utils/shiftClockWindow';
import {
  fieldBlocksHeroStoreClockOut,
  isClockInWorkAction,
  isClockOutWorkAction,
  isFieldWorkPunchAction,
  isWorkPunchActionEnabled,
  formatWorkPunchHint,
  formatWorkPunchTitle,
} from '../utils/workPunch';

type HeroDisplayMode = 'clock_in' | 'clock_out' | 'clocked_in' | 'completed' | 'idle';

function HeroCategoryIcon({
  isField,
  size = 28,
  color = '#fff',
}: {
  isField: boolean;
  size?: number;
  color?: string;
}) {
  if (isField) {
    return <Ionicons color={color} name="car-outline" size={size} />;
  }
  return <StoreShiftIcon color={color} size={size} />;
}

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

function StoreShiftHeroBody({
  actions,
  clockInIso,
  clockOutIso,
  slot,
  punchBusy,
  onPunch,
  t,
  i18n,
  now,
}: {
  actions: ReturnType<typeof getShiftCardActions>;
  clockInIso: string | undefined;
  clockOutIso: string | undefined;
  slot: MyPublishedShiftSlot;
  punchBusy?: boolean;
  onPunch: () => void | Promise<void>;
  t: ReturnType<typeof useTranslation>['t'];
  i18n: ReturnType<typeof useTranslation>['i18n'];
  now: Date;
}) {
  const canPunch = actions.showClockIn || actions.showClockOut;
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
  const minutesUntilEnd =
    heroMode === 'clocked_in'
      ? minutesUntilShiftEnd(slot.range, now, slot.overnightRole ?? 'normal')
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.clockIconWrap}>
          <StoreShiftIcon color="#fff" size={28} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {heroMode === 'clocked_in' ? (
          <>
            <Text style={styles.subtitle} numberOfLines={2}>
              {formatShiftHeroName(slot)}
            </Text>
            {minutesUntilEnd != null ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>
                  {t('minutesUntilShiftEnd', { count: minutesUntilEnd })}
                </Text>
              </View>
            ) : null}
          </>
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

type Props = {
  slot?: MyPublishedShiftSlot;
  workDateIso: string;
  todayIso: string;
  punch?: ShiftPunchRecord;
  pairPunch?: ShiftPunchRecord;
  punchesKnown?: boolean;
  punchBusy?: boolean;
  workAction?: CurrentPunchAction;
  activeFieldJob?: TimelineFieldJobItem;
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
  workAction,
  activeFieldJob,
  onPunch,
}: Props) {
  const { t, i18n } = useTranslation();
  const now = getApproximateServerNowDate();
  const workReady = isWorkPunchActionEnabled(workAction);
  const workWaiting = workAction?.action === 'WAITING';
  const workDone = workAction?.action === 'DONE';

  const overnightRole = slot?.overnightRole ?? 'normal';
  const slotActions = slot
    ? getShiftCardActions(
        workDateIso,
        slot.range,
        punch,
        todayIso,
        now,
        punchesKnown,
        overnightRole,
        pairPunch,
      )
    : null;
  const slotCanPunch = !!(slotActions && (slotActions.showClockIn || slotActions.showClockOut));
  const shouldPreferStoreShiftHero =
    !!slot &&
    !!slotActions &&
    slotCanPunch &&
    !workReady &&
    workAction?.action !== 'DONE' &&
    !(activeFieldJob && shouldShowFieldHeroInService(activeFieldJob, now));
  const clockInIso = slot ? resolveClockInIso(punch, pairPunch, overnightRole) : undefined;
  const clockOutIso = punch?.clockOutAt;

  const fieldBlocksStoreClockOutHero = fieldBlocksHeroStoreClockOut({
    activeFieldJob,
    now,
  });

  // 1. 店班下班（优先于一切上班卡）
  if (slot && slotActions?.showClockOut && !fieldBlocksStoreClockOutHero) {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        i18n={i18n}
        now={now}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={slot}
        t={t}
      />
    );
  }

  // 2. 外勤/店班下班类 work 动作
  if (workReady && workAction && isClockOutWorkAction(workAction.action)) {
    const title = formatWorkPunchTitle(workAction, t);
    const isField = isFieldWorkPunchAction(workAction.action);
    const subtitle = isField
      ? t('todayTimelineFieldJob')
      : slot
        ? formatShiftHeroName(slot)
        : formatWorkPunchHint(workAction, t);

    return (
      <View style={styles.card}>
        <View style={styles.left}>
          <View style={styles.clockIconWrap}>
            <HeroCategoryIcon isField={isField} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel={title}
          disabled={punchBusy}
          onPress={() => void onPunch()}
          style={({ pressed }) => [
            styles.punchBtn,
            punchBusy && styles.punchBtnDisabled,
            pressed && !punchBusy && styles.punchBtnPressed,
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

  const storeHeroMode = slotActions
    ? resolveHeroDisplayMode(slotActions, clockInIso, clockOutIso)
    : 'idle';

  // 2b. 外勤服务中（已打上班、未到计划结束）：优先于 DONE / 通用等待
  if (activeFieldJob && shouldShowFieldHeroInService(activeFieldJob, now)) {
    return (
      <View style={styles.card}>
        <View style={styles.left}>
          <View style={styles.clockIconWrap}>
            <Ionicons color="#fff" name="car-outline" size={28} />
          </View>
          <Text style={styles.title}>{t('fieldServiceHeroInProgress')}</Text>
          <Text style={styles.subtitle}>{t('todayTimelineFieldJob')}</Text>
        </View>
        <View style={styles.punchBtn}>
          <View style={[styles.punchCircle, styles.punchCircleInService]}>
            <Ionicons color="#B45309" name="car-outline" size={36} />
          </View>
          <Text style={styles.punchBtnText}>{t('fieldServiceHeroInProgress')}</Text>
        </View>
      </View>
    );
  }

  // 2c. 店班已上班、尚未到下班窗口（优先于通用 WAITING）
  if (slot && slotActions && storeHeroMode === 'clocked_in') {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        i18n={i18n}
        now={now}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={slot}
        t={t}
      />
    );
  }

  if (shouldPreferStoreShiftHero && slot && slotActions) {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        i18n={i18n}
        now={now}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={slot}
        t={t}
      />
    );
  }

  // 3. 外勤/店班上班类 work 动作（仅当无下班卡可打时）
  if (workReady && workAction && isClockInWorkAction(workAction.action)) {
    const title = formatWorkPunchTitle(workAction, t);
    const isField = isFieldWorkPunchAction(workAction.action);
    const subtitle = isField
      ? t('todayTimelineFieldJob')
      : slot
        ? formatShiftHeroName(slot)
        : formatWorkPunchHint(workAction, t);

    return (
      <View style={styles.card}>
        <View style={styles.left}>
          <View style={styles.clockIconWrap}>
            <HeroCategoryIcon isField={isField} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel={title}
          disabled={punchBusy}
          onPress={() => void onPunch()}
          style={({ pressed }) => [
            styles.punchBtn,
            punchBusy && styles.punchBtnDisabled,
            pressed && !punchBusy && styles.punchBtnPressed,
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

  if ((workWaiting || workDone) && workAction) {
    const title = formatWorkPunchTitle(workAction, t);
    const subtitle = '';

    return (
      <View style={styles.card}>
        <View style={styles.left}>
          <View style={styles.clockIconWrap}>
            <StoreShiftIcon color="#fff" size={28} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.punchBtn}>
          <View style={[styles.punchCircle, styles.punchCircleDone]}>
            <Ionicons color={workDone ? colors.success : colors.textMuted} name="checkmark-circle" size={36} />
          </View>
          <Text style={styles.punchBtnText}>{workDone ? t('todayActionDone') : t('todayActionWaiting')}</Text>
        </View>
      </View>
    );
  }

  if (!slot || !slotActions) return null;

  return (
    <StoreShiftHeroBody
      actions={slotActions}
      clockInIso={clockInIso}
      clockOutIso={clockOutIso}
      i18n={i18n}
      now={now}
      onPunch={onPunch}
      punchBusy={punchBusy}
      slot={slot}
      t={t}
    />
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
  punchCircleInService: { backgroundColor: '#FEF3C7' },
  punchBtnText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
