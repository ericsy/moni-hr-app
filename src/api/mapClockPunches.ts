import type { AppClockPunchResult, ShiftPunchRecord } from './types';
import {
  buildLegacyCellKey,
  buildShiftIdentityKey,
  formatRangeFromIdentity,
  identityFromPunch,
  identityFromScheduledRange,
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

function recordsMatchForMerge(a: ShiftPunchRecord, b: ShiftPunchRecord): boolean {
  if (a.workDate !== b.workDate) return false;
  if (a.scheduleId && b.scheduleId && a.scheduleId === b.scheduleId) return true;
  const idA = identityFromScheduledRange(a.workDate, a.scheduledRange);
  const idB = identityFromScheduledRange(b.workDate, b.scheduledRange);
  if (idA && idB && buildShiftIdentityKey(idA) === buildShiftIdentityKey(idB)) return true;
  if (a.shiftKey && b.shiftKey && a.shiftKey === b.shiftKey) return true;
  return false;
}

/** 合并同日同班被拆开的上下班打卡（如 shiftKey / scheduleId 不一致） */
export function consolidateShiftPunchRecords(records: ShiftPunchRecord[]): ShiftPunchRecord[] {
  const merged: ShiftPunchRecord[] = [];
  for (const r of records) {
    const idx = merged.findIndex((m) => recordsMatchForMerge(m, r));
    if (idx < 0) {
      merged.push({ ...r });
      continue;
    }
    const m = merged[idx];
    merged[idx] = {
      ...m,
      scheduleId: m.scheduleId || r.scheduleId,
      shiftKey: m.shiftKey || r.shiftKey,
      scheduledRange: m.scheduledRange || r.scheduledRange,
      clockInAt: m.clockInAt || r.clockInAt,
      clockOutAt: m.clockOutAt || r.clockOutAt,
    };
  }
  return merged;
}

/** 单次打卡成功后立即合并到本地记录，避免刷新延迟导致 Hero 仍停在本班 */
export function applyClockPunchResult(
  records: ShiftPunchRecord[],
  punch: AppClockPunchResult,
  workDate: string,
): ShiftPunchRecord[] {
  const identity = identityFromPunch(punch, workDate);
  const shiftKey = identity
    ? buildShiftIdentityKey(identity)
    : buildLegacyCellKey(workDate, punch.publishedCellId);
  const scheduleId = String(punch.publishedCellId);
  const scheduledRange = identity
    ? formatRangeFromIdentity(identity)
    : scheduledRangeFromPunch(punch, workDate);
  const at = punch.punchedAt;
  const isIn = isClockInPunchType(punch.punchType);
  const isOut = isClockOutPunchType(punch.punchType);

  const idx = records.findIndex(
    (r) =>
      r.workDate === workDate &&
      (r.shiftKey === shiftKey ||
        (scheduleId && r.scheduleId === scheduleId) ||
        recordsMatchForMerge(r, {
          scheduleId,
          shiftKey,
          workDate,
          scheduledRange,
        })),
  );

  if (idx >= 0) {
    const row = records[idx];
    return records.map((r, i) =>
      i === idx
        ? {
            ...row,
            clockInAt: isIn ? at : row.clockInAt,
            clockOutAt: isOut ? at : row.clockOutAt,
          }
        : r,
    );
  }

  return [
    ...records,
    {
      scheduleId,
      shiftKey,
      workDate,
      scheduledRange,
      clockInAt: isIn ? at : undefined,
      clockOutAt: isOut ? at : undefined,
    },
  ];
}
