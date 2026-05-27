import { isClockInPunchType, isClockOutPunchType } from './mapClockPunches';
import type { MyPublishedShiftSlot } from './mapPublishedSchedule';
import type { AppClockPunchResult } from './types';
import {
  buildLegacyCellKey,
  buildShiftIdentityKey,
  buildShiftKeyFromTarget,
  identityFromPunch,
  shiftMatchTargetFromSlot,
} from '../utils/shiftIdentity';

export type ShiftPunchGroup = {
  scheduleId: string;
  shiftKey: string;
  slot: MyPublishedShiftSlot | null;
  clockIn: AppClockPunchResult | null;
  clockOut: AppClockPunchResult | null;
  /** 同班次重复/其它类型打卡 */
  extra: AppClockPunchResult[];
};

function rangeStartMin(range: string): number {
  const part = range.split(/[–-]/)[0]?.trim() ?? '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(part);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function punchGroupKey(p: AppClockPunchResult, workDate: string): string {
  const identity = identityFromPunch(p, workDate);
  if (identity) return buildShiftIdentityKey(identity);
  return buildLegacyCellKey(workDate, p.publishedCellId);
}

function collectGroup(
  scheduleId: string,
  shiftKey: string,
  slot: MyPublishedShiftSlot | null,
  list: AppClockPunchResult[],
): ShiftPunchGroup {
  let clockIn: AppClockPunchResult | null = null;
  let clockOut: AppClockPunchResult | null = null;
  const extra: AppClockPunchResult[] = [];

  for (const p of list) {
    if (isClockInPunchType(p.punchType)) {
      if (!clockIn) clockIn = p;
      else extra.push(p);
    } else if (isClockOutPunchType(p.punchType)) {
      clockOut = p;
    } else {
      extra.push(p);
    }
  }

  return { scheduleId, shiftKey, slot, clockIn, clockOut, extra };
}

/** 按班次快照聚合打卡：先排班顺序，再补仅有打卡无排班的记录 */
export function buildShiftPunchGroups(
  slots: MyPublishedShiftSlot[],
  punches: AppClockPunchResult[],
  workDate: string,
): ShiftPunchGroup[] {
  const punchByKey = new Map<string, AppClockPunchResult[]>();
  for (const p of punches) {
    const key = punchGroupKey(p, workDate);
    const arr = punchByKey.get(key) ?? [];
    arr.push(p);
    punchByKey.set(key, arr);
  }

  const groups: ShiftPunchGroup[] = [];
  const used = new Set<string>();

  const sortedSlots = [...slots].sort((a, b) => rangeStartMin(a.range) - rangeStartMin(b.range));

  for (const slot of sortedSlots) {
    const shiftKey = buildShiftKeyFromTarget(shiftMatchTargetFromSlot(workDate, slot));
    used.add(shiftKey);
    groups.push(collectGroup(slot.id, shiftKey, slot, punchByKey.get(shiftKey) ?? []));
  }

  const orphanKeys = [...punchByKey.keys()].filter((key) => !used.has(key));
  orphanKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const key of orphanKeys) {
    const list = punchByKey.get(key) ?? [];
    const scheduleId = list[0] ? String(list[0].publishedCellId) : key;
    groups.push(collectGroup(scheduleId, key, null, list));
  }

  return groups;
}
