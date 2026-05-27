import type { AppClockPunchResult, ShiftPunchRecord } from './types';
import {
  buildLegacyCellKey,
  buildShiftIdentityKey,
  identityFromPunch,
  scheduledRangeFromPunch,
} from '../utils/shiftIdentity';

function normalizePunchType(punchType: string): string {
  return punchType.trim().toLowerCase().replace(/-/g, '_');
}

export function isClockInPunchType(punchType: string): boolean {
  const t = normalizePunchType(punchType);
  return t === 'clock_in' || t === 'clockin';
}

export function isClockOutPunchType(punchType: string): boolean {
  const t = normalizePunchType(punchType);
  return t === 'clock_out' || t === 'clockout';
}

type AggRow = {
  shiftKey: string;
  scheduleId: string;
  scheduledRange: string;
  clockInAt?: string;
  clockOutAt?: string;
};

/**
 * 将按天打卡列表按排班快照聚合（优先日期+时段；无快照时退回 publishedCellId）。
 */
export function mapPunchesByPublishedCell(
  punches: AppClockPunchResult[],
  workDate: string,
): ShiftPunchRecord[] {
  const byKey = new Map<string, AggRow>();

  for (const p of punches) {
    const identity = identityFromPunch(p, workDate);
    const shiftKey = identity
      ? buildShiftIdentityKey(identity)
      : buildLegacyCellKey(workDate, p.publishedCellId);
    const scheduledRange = identity
      ? `${identity.startTime}–${identity.endTime}`
      : scheduledRangeFromPunch(p, workDate);

    const row = byKey.get(shiftKey) ?? {
      shiftKey,
      scheduleId: String(p.publishedCellId),
      scheduledRange,
      clockInAt: undefined,
      clockOutAt: undefined,
    };

    if (isClockInPunchType(p.punchType)) {
      if (!row.clockInAt) row.clockInAt = p.punchedAt;
    } else if (isClockOutPunchType(p.punchType)) {
      row.clockOutAt = p.punchedAt;
    }

    byKey.set(shiftKey, row);
  }

  return Array.from(byKey.values()).map((row) => ({
    scheduleId: row.scheduleId,
    shiftKey: row.shiftKey,
    workDate,
    scheduledRange: row.scheduledRange,
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
  }));
}
