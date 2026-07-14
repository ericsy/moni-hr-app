import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import type { OvernightRole } from './overnightShiftPair';
import { calendarDateKey } from './calendarDateKey';
import { getApproximateServerNowDate } from './serverClock';
import {
  getShiftCardActions,
  parseShiftRange,
  type LeavePunchWindowAdjustInput,
} from './shiftClockWindow';
import type { ShiftLeaveRequestStatus } from './leaveRequestEligibility';

export type TodayShiftBadgeKind =
  | 'not_started'
  | 'not_punched'
  | 'clocked_in'
  | 'incomplete'
  | 'completed'
  | 'leave_pending'
  | 'leave_approved';

type PunchLookup = (slot: MyPublishedShiftSlot) => ShiftPunchRecord | undefined;
type LeaveAdjustLookup = (slot: MyPublishedShiftSlot) => LeavePunchWindowAdjustInput | undefined;

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

/** Hero 已打卡态：区域 · 班次（不含时段）；无班次名时只显示区域 */
export function formatShiftHeroName(slot: Pick<MyPublishedShiftSlot, 'areaName' | 'shiftName'>): string {
  const area = slot.areaName?.trim();
  const shift = slot.shiftName?.trim();
  const areaOk = area && area !== '—';
  const shiftOk = shift && shift !== '—';
  if (areaOk && shiftOk && area !== shift) {
    return `${area} · ${shift}`;
  }
  return (areaOk ? area : '') || (shiftOk ? shift : '') || '—';
}

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
  // 已打下班即视为完成（允许未打上班仅打下班）
  return !!punch?.clockOutAt;
}

/** 距目标时刻还有多少分钟；已过或无效时返回 null */
export function minutesUntilHm(targetMin: number, now: Date = getApproximateServerNowDate()): number | null {
  const diff = targetMin - nowMinutes(now);
  return diff > 0 ? diff : null;
}

/** 今日多班中第一个可上班打卡的店班（不因前一段店班漏下班而阻挡） */
export function findPunchableStoreClockInSlot(
  slots: MyPublishedShiftSlot[],
  workDateIso: string,
  todayIso: string,
  getPunch: PunchLookup,
  getPairPunch: PunchLookup,
  punchesKnown: boolean,
  /** 整段请假班次跳过；部分请假仍可打卡 */
  isShiftOnFullLeave?: (slot: MyPublishedShiftSlot) => boolean,
  getLeavePunchAdjust?: LeaveAdjustLookup,
): MyPublishedShiftSlot | undefined {
  const now = getApproximateServerNowDate();
  for (const slot of slots) {
    if (isShiftOnFullLeave?.(slot)) continue;
    const actions = getShiftCardActions(
      workDateIso,
      slot.range,
      getPunch(slot),
      todayIso,
      now,
      punchesKnown,
      slot.overnightRole ?? 'normal',
      getPairPunch(slot),
      getLeavePunchAdjust?.(slot),
    );
    if (actions.showClockIn) return slot;
  }
  return undefined;
}

/**
 * 今日多班 Hero 店班焦点：
 * 下一段可上班 > 当前可下班 > 过窗不完整 > 班内已打卡 > 即将开始
 * （衔接班场景：B 已到上班时间时，不因 A 漏下班而挡住 B）
 */
export function pickHeroShiftIndex(
  slots: MyPublishedShiftSlot[],
  workDateIso: string,
  todayIso: string,
  getPunch: PunchLookup,
  getPairPunch: PunchLookup,
  punchesKnown: boolean,
  /** 整段请假（待审/已通过）不参与 Hero；部分请假仍参与并按请假时段调窗 */
  isShiftOnFullLeave?: (slot: MyPublishedShiftSlot) => boolean,
  getLeavePunchAdjust?: LeaveAdjustLookup,
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
      getLeavePunchAdjust?.(s),
    );
    if (actions.showClockIn) return 0;
    if (actions.showClockOut) return 1;
    if (actions.statusKey === 'shiftStatusCompleted') return 99;
    if (actions.statusKey === 'shiftStatusPastIncomplete') return 2;
    if (hasClockedInNotOut(s, punch, pairPunch)) return 3;
    if (actions.statusKey === 'shiftStatusUpcoming') return 4;
    if (actions.statusKey === 'shiftStatusFuture') return 5;
    if (isShiftPunchComplete(s, punch, pairPunch)) return 99;
    return 6;
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
  // 全部为整段请假/已完成时不选店班 Hero
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
  leavePunchAdjust?: LeavePunchWindowAdjustInput | null,
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
    leavePunchAdjust,
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
    return 'incomplete';
  }
  return 'not_started';
}

export function todayIsoKey(): string {
  return calendarDateKey(getApproximateServerNowDate());
}
