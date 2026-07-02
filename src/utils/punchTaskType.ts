import type { TFunction } from 'i18next';

import type { AppClockPunchResult } from '../api/types';

export type PunchTaskKind =
  | 'store_shift'
  | 'field_job'
  | 'field_sync_store_in'
  | 'field_sync_store_out';

function normalizeRefType(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function normalizeSyncEffect(value: string | null | undefined): string {
  return (value ?? 'none').trim().toLowerCase().replace(/-/g, '_');
}

export function resolvePunchTaskKind(punch: AppClockPunchResult): PunchTaskKind {
  if (isFieldJobPunch(punch)) return 'field_job';
  const sync = normalizeSyncEffect(punch.syncEffect);
  if (sync === 'store_clock_in') return 'field_sync_store_in';
  if (sync === 'store_clock_out') return 'field_sync_store_out';
  return 'store_shift';
}

export function punchTaskKindLabelKey(kind: PunchTaskKind): string {
  switch (kind) {
    case 'field_job':
      return 'punchTaskFieldJob';
    case 'field_sync_store_in':
      return 'punchTaskFieldSyncStoreIn';
    case 'field_sync_store_out':
      return 'punchTaskFieldSyncStoreOut';
    case 'store_shift':
    default:
      return 'punchTaskStoreShift';
  }
}

export function formatPunchTaskTypeLabel(punch: AppClockPunchResult, t: TFunction): string {
  const key = punchTaskKindLabelKey(resolvePunchTaskKind(punch));
  const label = t(key);
  if (typeof label === 'string' && label.trim() && label !== key) {
    return label;
  }
  switch (key) {
    case 'punchTaskFieldJob':
      return '外勤';
    case 'punchTaskFieldSyncStoreIn':
      return '外勤同步上班';
    case 'punchTaskFieldSyncStoreOut':
      return '外勤同步下班';
    case 'punchTaskStoreShift':
    default:
      return '店班';
  }
}

function hasStorePublishedCell(punch: AppClockPunchResult): boolean {
  const cellId = Number(punch.publishedCellId);
  return Number.isFinite(cellId) && cellId > 0;
}

export function isFieldJobPunch(punch: AppClockPunchResult): boolean {
  if (normalizeRefType(punch.refType) === 'field_job') return true;
  // 兼容未返回 refType 的外勤打卡（publishedCellId 为空/0 且有 refId）
  return !hasStorePublishedCell(punch) && punch.refId != null;
}

/** 无 refType/refId 时根据快照特征推断外勤（无店班格子、有计划时段、无区域名） */
export function isLikelyFieldJobPunch(punch: AppClockPunchResult): boolean {
  if (isFieldJobPunch(punch)) return true;
  if (hasStorePublishedCell(punch)) return false;
  const hasTimes = !!(punch.shiftStartTime?.trim() && punch.shiftEndTime?.trim());
  const noArea = !punch.areaName?.trim();
  return hasTimes && noArea;
}

export function isFieldJobPunchGroup(shiftKey: string): boolean {
  return shiftKey.startsWith('field_job:');
}

export function formatFieldJobPunchTitle(
  punch: Pick<AppClockPunchResult, 'customerName' | 'shiftName'> | null | undefined,
  t: TFunction,
): string {
  const customer = punch?.customerName?.trim();
  if (customer) return customer;
  const service = punch?.shiftName?.trim();
  if (service) return service;
  const label = t('todayTimelineFieldJob');
  return typeof label === 'string' && label.trim() ? label : '外勤服务';
}
