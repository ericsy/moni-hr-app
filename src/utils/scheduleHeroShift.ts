import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import type { OvernightRole } from './overnightShiftPair';
import { calendarDateKey } from './calendarDateKey';
import { getApproximateServerNowDate } from './serverClock';
import { getShiftCardActions, parseShiftRange } from './shiftClockWindow';
import type { ShiftLeaveRequestStatus } from './leaveRequestEligibility';

export type TodayShiftBadgeKind =
  | 'not_started'
  | 'not_punched'
  | 'clocked_in'
  | 'completed'
  | 'leave_pending'
  | 'leave_approved';

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function formatMinutesHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`;
}

export function formatShiftStartHm(range: string): string {
  const parsed = parseShiftRange(range);
  if (!parsed) return '—';
  return formatMinutesHm(parsed.startMin);
}

export function formatShiftEndHm(range: string): string {
  const parsed = parseShiftRange(range);
  if (!parsed) return '—';
  return formatMinutesHm(parsed.endMin);
}

/** 距班次开始还有多少分钟；已开始或无法解析时返回 null */
export function minutesUntilShiftStart(range: string, now: Date = getApproximateServerNowDate()): number | null {
  const parsed = parseShiftRange(range);
  if (!parsed) return null;
  const diff = parsed.startMin - nowMinutes(now);
  return diff > 0 ? diff : null;
}

/** 距班次结束还有多少分钟；已结束、未开始或无法解析时返回 null */
export function minutesUntilShiftEnd(
  range: string,
  now: Date = getApproximateServerNowDate(),
  overnightRole: OvernightRole = 'normal',
): number | null {
  if (overnightRole === 'start') return null;
  const parsed = parseShiftRange(range);
  if (!parsed) return null;
  const nowMin = nowMinutes(now);
  const { startMin, endMin } = parsed;
  const overnight = endMin <= startMin;

  if (overnight) {
    if (nowMin >= startMin) {
      return 1440 - nowMin + endMin;
    }
    if (nowMin < endMin) {
      return endMin - nowMin;
    }
    return null;
  }

  if (nowMin >= endMin || nowMin < startMin) return null;
  return endMin - nowMin;
}

/** Hero 已打卡态：区域 · 班次（不含时段） */
export function formatShiftHeroName(slot: Pick<MyPublishedShiftSlot, 'areaName' | 'shiftName'>): string {
  const area = slot.areaName?.trim();
  const shift = slot.shiftName?.trim();
  if (area && shift && area !== shift) {
    return `${area} · ${shift}`;
  }
  return area || shift || '—';
}

type PunchLookup = (slot: MyPublishedShiftSlot) => ShiftPunchRecord | undefined;

function hasClockedInNotOut(
  slot: MyPublishedShiftSlot,
  punch: ShiftPunchRecord | undefined,
  pairPunch: ShiftPunchRecord | undefined,
): boolean {
  const role = slot.overnightRole ?? 'normal';
  const hasIn =
    role === 'end'
      ? !!(pairPunch?.clockInAt || punch?.clockInAt)
      : !!punch?.clockInAt;
  const hasOut = role === 'start' ? false : !!punch?.clockOutAt;
  return hasIn && !hasOut;
}

function isShiftPunchComplete(
  slot: MyPublishedShiftSlot,
  punch: ShiftPunchRecord | undefined,
  pairPunch: ShiftPunchRecord | undefined,
): boolean {
  const role = slot.overnightRole ?? 'normal';
  if (role === 'start') return !!punch?.clockInAt;
  if (role === 'end') return !!punch?.clockOutAt;
  return !!punch?.clockInAt && !!punch?.clockOutAt;
}

/** 今日多班时：下班打卡优先于上班打卡（可下班 → 已上班未下班 → 可上班 → 即将开始 → 已完成置后） */
export function pickHeroShiftIndex(
  slots: MyPublishedShiftSlot[],
  workDateIso: string,
  todayIso: string,
  getPunch: PunchLookup,
  getPairPunch: PunchLookup,
  punchesKnown: boolean,
  /** 整段请假的班次不参与 Hero 打卡 */
  isShiftOnFullLeave?: (slot: MyPublishedShiftSlot) => boolean,
): number {
  if (slots.length === 0) return -1;
  const now = getApproximateServerNowDate();

  const score = (i: number): number => {
    const s = slots[i];
    if (isShiftOnFullLeave?.(s)) return 99;
    const punch = getPunch(s);
    const pairPunch = getPairPunch(s);
    const actions = getShiftCardActions(
      workDateIso,
      s.range,
      punch,
      todayIso,
      now,
      punchesKnown,
      s.overnightRole ?? 'normal',
      pairPunch,
    );
    if (actions.showClockOut) return 0;
    if (actions.statusKey === 'shiftStatusCompleted') return 99;
    if (hasClockedInNotOut(s, punch, pairPunch)) return 1;
    if (actions.showClockIn) return 2;
    if (actions.statusKey === 'shiftStatusUpcoming') return 3;
    if (actions.statusKey === 'shiftStatusFuture') return 4;
    if (isShiftPunchComplete(s, punch, pairPunch)) return 99;
    return 5;
  };

  let best = 0;
  let bestScore = score(0);
  for (let i = 1; i < slots.length; i++) {
    const s = score(i);
    if (s < bestScore) {
      best = i;
      bestScore = s;
    }
  }
  // 全部为请假/已完成时不选店班 Hero
  if (bestScore >= 99) return -1;
  return best;
}

export function getTodayShiftBadgeKind(
  workDateIso: string,
  slot: MyPublishedShiftSlot,
  todayIso: string,
  punch: ShiftPunchRecord | undefined,
  pairPunch: ShiftPunchRecord | undefined,
  punchesKnown: boolean,
  leaveRequestStatus: ShiftLeaveRequestStatus,
): TodayShiftBadgeKind {
  if (leaveRequestStatus === 'pending') return 'leave_pending';
  if (leaveRequestStatus === 'approved') return 'leave_approved';

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

  if (actions.statusKey === 'shiftStatusCompleted') return 'completed';
  if (
    actions.statusKey === 'shiftStatusClockedIn' ||
    actions.statusKey === 'shiftStatusClockedInWaitEnd' ||
    actions.statusKey === 'shiftStatusCanClockOut'
  ) {
    return 'clocked_in';
  }
  if (actions.showClockIn || actions.statusKey === 'shiftStatusCanClockIn') {
    return 'not_punched';
  }
  if (
    actions.statusKey === 'shiftStatusFuture' ||
    actions.statusKey === 'shiftStatusUpcoming' ||
    !actions.showStatus
  ) {
    return 'not_started';
  }
  if (actions.statusKey === 'shiftStatusPastIncomplete') {
    const hasIn =
      !!punch?.clockInAt || (slot.overnightRole === 'end' && !!pairPunch?.clockInAt);
    return hasIn ? 'clocked_in' : 'not_punched';
  }
  return 'not_started';
}

export function todayIsoKey(): string {
  return calendarDateKey(getApproximateServerNowDate());
}
