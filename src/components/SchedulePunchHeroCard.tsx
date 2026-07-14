import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShiftPunchRecord, LeaveRequest } from '../context/AuthContext';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { CurrentPunchAction, TimelineFieldJobItem } from '../types/fieldService';
import { colors } from '../theme/colors';
import { StoreShiftIcon } from './icons/StoreShiftIcon';
import { formatPunchHm } from '../utils/formatPunchTime';
import {
  fieldJobScheduledRange,
  findHeroIncompleteFieldJob,
  preferredFieldMissedPunchKind,
  shouldShowFieldHeroInService,
} from '../utils/fieldMissedPunchEligibility';
import { getApproximateServerNowDate } from '../utils/serverClock';
import {
  formatShiftEndHm,
  formatShiftHeroName,
  formatShiftStartHm,
  minutesUntilHm,
  minutesUntilShiftEnd,
  minutesUntilShiftStart,
} from '../utils/scheduleHeroShift';
import { getShiftCardActions } from '../utils/shiftClockWindow';
import { getApprovedLeavePunchWindowAdjust, hasOpenFullLeaveForShift } from '../utils/leaveRequestEligibility';
import {
  fieldBlocksHeroStoreClockOut,
  isClockInWorkAction,
  isClockOutWorkAction,
  isFieldWorkPunchAction,
  isWorkPunchActionEnabled,
  formatWorkPunchHint,
  formatWorkPunchTitle,
} from '../utils/workPunch';

type HeroDisplayMode = 'clock_in' | 'clock_out' | 'clocked_in' | 'incomplete' | 'completed' | 'idle';

function resolveStoreShiftForAction(
  action: CurrentPunchAction | undefined,
  storeShifts: MyPublishedShiftSlot[],
): MyPublishedShiftSlot | undefined {
  if (!action?.refId || action.refType !== 'store_shift') return undefined;
  return storeShifts.find((row) => row.id === String(action.refId));
}

function formatFieldEndHm(job: TimelineFieldJobItem, language: string): string {
  const end = job.end?.trim() ?? '';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(end)) return end.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(end)) return formatPunchHm(end, language);
  return end.slice(0, 5) || '—';
}

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
  if (actions.statusKey === 'shiftStatusPastIncomplete') {
    return 'incomplete';
  }
  if (
    clockInIso &&
    (actions.statusKey === 'shiftStatusClockedInWaitEnd' ||
      actions.statusKey === 'shiftStatusClockedIn')
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
  onApplyMissedPunch,
  leaveAdjust,
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
  onApplyMissedPunch?: () => void;
  leaveAdjust?: ReturnType<typeof getApprovedLeavePunchWindowAdjust>;
  t: ReturnType<typeof useTranslation>['t'];
  i18n: ReturnType<typeof useTranslation>['i18n'];
  now: Date;
}) {
  const canPunch = actions.showClockIn || actions.showClockOut;
  const heroMode = resolveHeroDisplayMode(actions, clockInIso, clockOutIso);
  const isClockOut = heroMode === 'clock_out';
  const isIncomplete = heroMode === 'incomplete';
  const title =
    heroMode === 'completed'
      ? t('shiftBadgeCompleted')
      : isIncomplete
        ? t('shiftBadgeIncomplete')
      : heroMode === 'clocked_in'
        ? t('shiftBadgeClockedIn')
        : isClockOut
          ? t('punchHeroClockOut')
          : t('punchHeroClockIn');
  const clockInHm =
    leaveAdjust?.effect === 'late_in' ? leaveAdjust.fromHm : formatShiftStartHm(slot.range);
  const clockOutHm =
    leaveAdjust?.effect === 'early_out' ? leaveAdjust.toHm : formatShiftEndHm(slot.range);
  const timeLabel = isClockOut ? clockOutHm : clockInHm;
  const shiftRangeLabel = `${formatShiftStartHm(slot.range)} – ${formatShiftEndHm(slot.range)}`;
  const minutesLeft =
    heroMode === 'clock_in'
      ? leaveAdjust?.effect === 'late_in'
        ? minutesUntilHm(leaveAdjust.partialFromMin, now)
        : minutesUntilShiftStart(slot.range, now)
      : null;
  const minutesUntilEnd =
    heroMode === 'clocked_in'
      ? leaveAdjust?.effect === 'early_out'
        ? minutesUntilHm(leaveAdjust.partialToMin, now)
        : minutesUntilShiftEnd(slot.range, now, slot.overnightRole ?? 'normal')
      : null;
  const canApplyMissed = isIncomplete && !!onApplyMissedPunch && actions.emphasizeMissedApply;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.clockIconWrap}>
          <StoreShiftIcon color="#fff" size={28} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {isIncomplete ? (
          <>
            <Text style={styles.subtitle} numberOfLines={2}>
              {formatShiftHeroName(slot)}
            </Text>
            <Text style={styles.hintText}>{shiftRangeLabel}</Text>
          </>
        ) : heroMode === 'clocked_in' ? (
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
      ) : isIncomplete ? (
        canApplyMissed ? (
          <Pressable
            accessibilityLabel={t('punchHeroApplyMissedPunch')}
            onPress={onApplyMissedPunch}
            style={({ pressed }) => [styles.punchBtn, pressed && styles.punchBtnPressed]}
          >
            <View style={[styles.punchCircle, styles.punchCircleIncomplete]}>
              <Ionicons color="#B91C1C" name="document-text-outline" size={32} />
            </View>
            <Text style={styles.punchBtnText}>{t('punchHeroApplyMissedPunch')}</Text>
          </Pressable>
        ) : (
          <View style={styles.punchBtn}>
            <View style={[styles.punchCircle, styles.punchCircleIncomplete]}>
              <Ionicons color="#B91C1C" name="alert-circle-outline" size={36} />
            </View>
            <Text style={styles.punchBtnText}>{t('shiftBadgeIncomplete')}</Text>
          </View>
        )
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

function FieldIncompleteHeroBody({
  job,
  onApplyMissedPunch,
  t,
  i18n,
}: {
  job: TimelineFieldJobItem;
  onApplyMissedPunch?: () => void;
  t: ReturnType<typeof useTranslation>['t'];
  i18n: ReturnType<typeof useTranslation>['i18n'];
}) {
  const endHm = formatFieldEndHm(job, i18n.language);
  const range = fieldJobScheduledRange(job);

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.clockIconWrap}>
          <Ionicons color="#fff" name="car-outline" size={28} />
        </View>
        <Text style={styles.title}>{t('fieldServiceHeroIncomplete')}</Text>
        <Text style={styles.subtitle}>{t('todayTimelineFieldJob')}</Text>
        <Text style={styles.hintText}>
          {t('fieldServiceHeroIncompleteHint', { end: endHm })}
        </Text>
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>{range}</Text>
        </View>
      </View>
      {onApplyMissedPunch ? (
        <Pressable
          accessibilityLabel={t('punchHeroApplyMissedPunch')}
          onPress={onApplyMissedPunch}
          style={({ pressed }) => [styles.punchBtn, pressed && styles.punchBtnPressed]}
        >
          <View style={[styles.punchCircle, styles.punchCircleIncomplete]}>
            <Ionicons color="#B91C1C" name="document-text-outline" size={32} />
          </View>
          <Text style={styles.punchBtnText}>{t('punchHeroApplyMissedPunch')}</Text>
        </Pressable>
      ) : (
        <View style={styles.punchBtn}>
          <View style={[styles.punchCircle, styles.punchCircleIncomplete]}>
            <Ionicons color="#B91C1C" name="alert-circle-outline" size={36} />
          </View>
          <Text style={styles.punchBtnText}>{t('fieldServiceHeroIncomplete')}</Text>
        </View>
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
  fieldJobs?: TimelineFieldJobItem[];
  attendanceRequests?: LeaveRequest[];
  storeShifts?: MyPublishedShiftSlot[];
  /** 门店关闭打卡要求 */
  clockPunchEnabled?: boolean;
  onApplyStoreMissedPunch?: () => void;
  onApplyFieldMissedPunch?: (job: TimelineFieldJobItem) => void;
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
  fieldJobs = [],
  attendanceRequests = [],
  storeShifts = [],
  clockPunchEnabled = true,
  onApplyStoreMissedPunch,
  onApplyFieldMissedPunch,
  onPunch,
}: Props) {
  const { t, i18n } = useTranslation();
  const now = getApproximateServerNowDate();
  if (!clockPunchEnabled) {
    return null;
  }
  const workReady = isWorkPunchActionEnabled(workAction);
  const workWaiting = workAction?.action === 'WAITING';
  const workDone = workAction?.action === 'DONE';
  const incompleteFieldJob = findHeroIncompleteFieldJob(fieldJobs, attendanceRequests, now);

  const overnightRole = slot?.overnightRole ?? 'normal';
  const slotOnFullLeave = !!(
    slot && hasOpenFullLeaveForShift(attendanceRequests, workDateIso, slot)
  );
  const effectiveSlot = slotOnFullLeave ? undefined : slot;
  const allStoreShiftsOnFullLeave =
    storeShifts.length > 0 &&
    storeShifts.every((s) => hasOpenFullLeaveForShift(attendanceRequests, workDateIso, s));
  const leaveAdjust = effectiveSlot
    ? getApprovedLeavePunchWindowAdjust(attendanceRequests, workDateIso, effectiveSlot)
    : undefined;
  const slotActions = effectiveSlot
    ? getShiftCardActions(
        workDateIso,
        effectiveSlot.range,
        punch,
        todayIso,
        now,
        punchesKnown,
        overnightRole,
        pairPunch,
        leaveAdjust,
      )
    : null;
  const slotCanPunch = !!(slotActions && (slotActions.showClockIn || slotActions.showClockOut));
  const shouldPreferStoreShiftHero =
    !!effectiveSlot &&
    !!slotActions &&
    slotCanPunch &&
    !workReady &&
    workAction?.action !== 'DONE' &&
    !(activeFieldJob && shouldShowFieldHeroInService(activeFieldJob, now));
  const clockInIso = effectiveSlot
    ? resolveClockInIso(punch, pairPunch, overnightRole)
    : undefined;
  const clockOutIso = punch?.clockOutAt;

  const fieldBlocksStoreClockOutHero = fieldBlocksHeroStoreClockOut({
    activeFieldJob,
    now,
  });

  // 1. 外勤下班（重叠时优先于店班离店）
  if (
    workReady &&
    workAction &&
    isClockOutWorkAction(workAction.action) &&
    isFieldWorkPunchAction(workAction.action)
  ) {
    const title = formatWorkPunchTitle(workAction, t);
    return (
      <View style={styles.card}>
        <View style={styles.left}>
          <View style={styles.clockIconWrap}>
            <HeroCategoryIcon isField />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{t('todayTimelineFieldJob')}</Text>
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

  // 2. 店班下班（外勤下班完成后，或无待完成外勤时）
  if (effectiveSlot && slotActions?.showClockOut && !fieldBlocksStoreClockOutHero) {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        leaveAdjust={leaveAdjust}
        i18n={i18n}
        now={now}
        onApplyMissedPunch={onApplyStoreMissedPunch}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={effectiveSlot}
        t={t}
      />
    );
  }

  // 3. 其余下班类 work 动作（如店班 STORE_CLOCK_OUT）
  if (workReady && workAction && isClockOutWorkAction(workAction.action)) {
    const title = formatWorkPunchTitle(workAction, t);
    const isField = isFieldWorkPunchAction(workAction.action);
    const actionStoreShift = resolveStoreShiftForAction(workAction, storeShifts);
    const subtitle = isField
      ? t('todayTimelineFieldJob')
      : actionStoreShift
        ? formatShiftHeroName(actionStoreShift)
      : effectiveSlot
        ? formatShiftHeroName(effectiveSlot)
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

  // 4. 外勤服务中（已打上班、未到计划结束）
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

  // 3. 外勤/店班上班类 work 动作（优先于不完整态与店班「已打卡」等待态）
  if (workReady && workAction && isClockInWorkAction(workAction.action)) {
    const title = formatWorkPunchTitle(workAction, t);
    const isField = isFieldWorkPunchAction(workAction.action);
    const actionStoreShift = resolveStoreShiftForAction(workAction, storeShifts);
    const subtitle = isField
      ? t('todayTimelineFieldJob')
      : actionStoreShift
        ? formatShiftHeroName(actionStoreShift)
      : effectiveSlot
        ? formatShiftHeroName(effectiveSlot)
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

  // 4. 外勤已过打卡窗仍缺卡（优先于店班「已打卡」等待态）
  if (incompleteFieldJob) {
    const punchKind = preferredFieldMissedPunchKind(incompleteFieldJob, attendanceRequests, now);
    const canApplyMissed = punchKind != null;
    return (
      <FieldIncompleteHeroBody
        i18n={i18n}
        job={incompleteFieldJob}
        onApplyMissedPunch={
          canApplyMissed && onApplyFieldMissedPunch
            ? () => onApplyFieldMissedPunch(incompleteFieldJob)
            : undefined
        }
        t={t}
      />
    );
  }

  // 5. 店班已上班、尚未到下班窗口（无更优先的可打卡/不完整动作时）
  if (effectiveSlot && slotActions && storeHeroMode === 'clocked_in') {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        leaveAdjust={leaveAdjust}
        i18n={i18n}
        now={now}
        onApplyMissedPunch={onApplyStoreMissedPunch}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={effectiveSlot}
        t={t}
      />
    );
  }

  // 6. 店班已过下班窗仍缺卡（无其他店班可上班时）
  if (
    effectiveSlot &&
    slotActions &&
    storeHeroMode === 'incomplete' &&
    !(workReady && workAction && isClockInWorkAction(workAction.action))
  ) {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        leaveAdjust={leaveAdjust}
        i18n={i18n}
        now={now}
        onApplyMissedPunch={onApplyStoreMissedPunch}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={effectiveSlot}
        t={t}
      />
    );
  }

  if (shouldPreferStoreShiftHero && effectiveSlot && slotActions) {
    return (
      <StoreShiftHeroBody
        actions={slotActions}
        clockInIso={clockInIso}
        clockOutIso={clockOutIso}
        leaveAdjust={leaveAdjust}
        i18n={i18n}
        now={now}
        onApplyMissedPunch={onApplyStoreMissedPunch}
        onPunch={onPunch}
        punchBusy={punchBusy}
        slot={effectiveSlot}
        t={t}
      />
    );
  }

  if ((workWaiting || workDone || allStoreShiftsOnFullLeave) && workAction) {
    const treatAsDone = workDone || allStoreShiftsOnFullLeave || (workWaiting && !effectiveSlot);
    const title = treatAsDone
      ? formatWorkPunchTitle({ action: 'DONE' }, t)
      : formatWorkPunchTitle(workAction, t);
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
            <Ionicons
              color={treatAsDone ? colors.success : colors.textMuted}
              name="checkmark-circle"
              size={36}
            />
          </View>
          <Text style={styles.punchBtnText}>
            {treatAsDone ? t('todayActionDone') : t('todayActionWaiting')}
          </Text>
        </View>
      </View>
    );
  }

  if (!effectiveSlot || !slotActions) return null;

  return (
    <StoreShiftHeroBody
      actions={slotActions}
      clockInIso={clockInIso}
      clockOutIso={clockOutIso}
      leaveAdjust={leaveAdjust}
      i18n={i18n}
      now={now}
      onApplyMissedPunch={onApplyStoreMissedPunch}
      onPunch={onPunch}
      punchBusy={punchBusy}
      slot={effectiveSlot}
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
  hintText: { marginTop: 6, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
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
  punchCircleIncomplete: { backgroundColor: '#FEE2E2' },
  punchBtnText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
