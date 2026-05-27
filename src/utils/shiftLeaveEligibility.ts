import type { ShiftPunchRecord } from '../api/types';
import { formatPunchHm } from './formatPunchTime';
import { compareHm, parseHm, parseScheduledHmRange } from './localDateTime';

/** 上班打卡相对计划开始时刻允许的最大迟到分钟数（在此范围内仍视为已覆盖班次） */
export const LATE_CLOCK_IN_GRACE_MINUTES = 30;

function hmFromPunchIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 展示用：上班 – 下班（缺一则显示已有） */
export function formatShiftPunchLine(
  punch: ShiftPunchRecord | undefined,
  language: string,
): string | null {
  if (!punch?.clockInAt && !punch?.clockOutAt) return null;
  const parts: string[] = [];
  if (punch.clockInAt) parts.push(formatPunchHm(punch.clockInAt, language));
  else parts.push('—');
  if (punch.clockOutAt) parts.push(formatPunchHm(punch.clockOutAt, language));
  else if (punch.clockInAt) parts.push('—');
  return parts.join(' – ');
}

function hmToMinutes(hm: string): number {
  const { hour, minute } = parseHm(hm);
  return hour * 60 + minute;
}

/** 上班打卡是否在计划开始 + 迟到宽限 之内 */
export function isClockInWithinLateGrace(
  clockInHm: string,
  shiftStartHm: string,
  graceMinutes: number = LATE_CLOCK_IN_GRACE_MINUTES,
): boolean {
  return hmToMinutes(clockInHm) <= hmToMinutes(shiftStartHm) + graceMinutes;
}

/**
 * 实际上下班打卡是否覆盖计划班次时段（已打满卡，不可再请该班假）。
 * 规则：有上下班打卡；上班 ≤ 计划开始 + 迟到宽限；下班 ≥ 计划结束。
 */
export function doesPunchCoverScheduledShift(
  punch: ShiftPunchRecord | undefined,
  scheduledRange: string,
  graceMinutes: number = LATE_CLOCK_IN_GRACE_MINUTES,
): boolean {
  if (!punch?.clockInAt || !punch?.clockOutAt) return false;
  const bounds = parseScheduledHmRange(scheduledRange);
  if (!bounds) return false;
  const inHm = hmFromPunchIso(punch.clockInAt);
  const outHm = hmFromPunchIso(punch.clockOutAt);
  if (!inHm || !outHm) return false;
  return (
    isClockInWithinLateGrace(inHm, bounds.start, graceMinutes) &&
    compareHm(outHm, bounds.end) >= 0
  );
}

export function hasAnyShiftPunch(punch: ShiftPunchRecord | undefined): boolean {
  return !!(punch?.clockInAt || punch?.clockOutAt);
}
