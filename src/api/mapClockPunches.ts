import type { AppClockPunchResult, ShiftPunchRecord } from './types';
import {
  buildLegacyCellKey,
  buildShiftIdentityKey,
  formatRangeFromIdentity,
  identityFromPunch,
  identityFromScheduledRange,
  scheduledRangeFromPunch,
} from '../utils/shiftIdentity';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

/** 映射单日打卡列表项（含 refType / syncEffect / 外勤客户名） */
export function mapClockPunchResults(rows: unknown[]): AppClockPunchResult[] {
  return rows.map((raw) => {
    const row = asRecord(raw);
    const shared = row.proxySharedDeviceOtherMerchantAdminIds ?? row.proxy_shared_device_other_merchant_admin_ids;
    return {
      id: asNumber(row.id) ?? 0,
      publishedCellId: asNumber(row.publishedCellId ?? row.published_cell_id) ?? 0,
      punchType: asString(row.punchType ?? row.punch_type) ?? '',
      withinGeofence: asBool(row.withinGeofence ?? row.within_geofence),
      distanceMeters: asNumber(row.distanceMeters ?? row.distance_meters) ?? 0,
      punchedAt: asString(row.punchedAt ?? row.punched_at) ?? '',
      scheduleDate: asString(row.scheduleDate ?? row.schedule_date) ?? null,
      shiftStartTime: asString(row.shiftStartTime ?? row.shift_start_time) ?? null,
      shiftEndTime: asString(row.shiftEndTime ?? row.shift_end_time) ?? null,
      areaName: asString(row.areaName ?? row.area_name) ?? null,
      shiftName: asString(row.shiftName ?? row.shift_name) ?? null,
      suspectedProxyPunch: asBool(row.suspectedProxyPunch ?? row.suspected_proxy_punch),
      proxyPunchReason: asString(row.proxyPunchReason ?? row.proxy_punch_reason) ?? null,
      proxySharedDeviceOtherMerchantAdminIds: Array.isArray(shared)
        ? shared.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : null,
      punchSource: asString(row.punchSource ?? row.punch_source) ?? null,
      refType: asString(row.refType ?? row.ref_type) ?? null,
      refId: asNumber(row.refId ?? row.ref_id) ?? null,
      syncEffect: asString(row.syncEffect ?? row.sync_effect) ?? null,
      customerName: asString(row.customerName ?? row.customer_name) ?? null,
    };
  });
}

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
