import { isClockInPunchType, isClockOutPunchType } from './mapClockPunches';
import type { MyPublishedShiftSlot } from './mapPublishedSchedule';
import type { AppClockPunchResult } from './types';
import { isFieldJobPunchGroup, isLikelyFieldJobPunch } from '../utils/punchTaskType';
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

function hmToMinutes(hm: string | null | undefined): number | null {
  const s = (hm ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function hmToMinutesFromIdentityKey(shiftKey: string): number | null {
  if (!shiftKey.startsWith('t:')) return null;
  const parts = shiftKey.slice(2).split('|');
  if (parts.length < 2) return null;
  return hmToMinutes(parts[1]);
}

function groupAnchorPunch(group: ShiftPunchGroup): AppClockPunchResult | null {
  return group.clockIn ?? group.clockOut ?? group.extra[0] ?? null;
}

/** 任务计划开始时刻（分钟），用于当天任务时间轴排序 */
function taskStartMinutes(group: ShiftPunchGroup): number {
  if (group.slot?.range) {
    return rangeStartMin(group.slot.range);
  }
  const punch = groupAnchorPunch(group);
  const fromPunch = hmToMinutes(punch?.shiftStartTime);
  if (fromPunch != null) return fromPunch;
  const fromKey = hmToMinutesFromIdentityKey(group.shiftKey);
  if (fromKey != null) return fromKey;
  const punchedAt = punch?.punchedAt;
  if (punchedAt) {
    const d = new Date(punchedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  return 24 * 60;
}

function taskEndMinutes(group: ShiftPunchGroup): number {
  if (group.slot?.range) {
    const part = group.slot.range.split(/[–-]/)[1]?.trim() ?? '';
    const end = hmToMinutes(part);
    if (end != null) return end;
  }
  const punch = groupAnchorPunch(group);
  const fromPunch = hmToMinutes(punch?.shiftEndTime);
  if (fromPunch != null) return fromPunch;
  const fromKey = group.shiftKey.startsWith('t:')
    ? hmToMinutes(group.shiftKey.slice(2).split('|')[2])
    : null;
  if (fromKey != null) return fromKey;
  return taskStartMinutes(group);
}

function isFieldJobGroup(group: ShiftPunchGroup): boolean {
  if (isFieldJobPunchGroup(group.shiftKey)) return true;
  const punch = groupAnchorPunch(group);
  return punch != null && isLikelyFieldJobPunch(punch);
}

function compareGroupsByTaskTime(a: ShiftPunchGroup, b: ShiftPunchGroup): number {
  const startDiff = taskStartMinutes(a) - taskStartMinutes(b);
  if (startDiff !== 0) return startDiff;
  // 开始时间相同：店班优先于外勤
  const kindDiff = (isFieldJobGroup(a) ? 1 : 0) - (isFieldJobGroup(b) ? 1 : 0);
  if (kindDiff !== 0) return kindDiff;
  const endDiff = taskEndMinutes(a) - taskEndMinutes(b);
  if (endDiff !== 0) return endDiff;
  return a.shiftKey.localeCompare(b.shiftKey, undefined, { numeric: true });
}

function rangeStartMin(range: string): number {
  return hmToMinutes(range.split(/[–-]/)[0]?.trim()) ?? 0;
}

function fieldJobGroupKey(p: AppClockPunchResult, workDate: string): string {
  if (p.refId != null) return `field_job:${p.refId}`;
  const identity = identityFromPunch(p, workDate);
  if (identity) return `field_job:${buildShiftIdentityKey(identity)}`;
  return `field_job:punch:${p.id}`;
}

function punchGroupKey(p: AppClockPunchResult, workDate: string): string {
  if (isLikelyFieldJobPunch(p)) {
    return fieldJobGroupKey(p, workDate);
  }
  const identity = identityFromPunch(p, workDate);
  if (identity) return buildShiftIdentityKey(identity);
  const cellId = Number(p.publishedCellId);
  const legacyCellId = Number.isFinite(cellId) && cellId > 0 ? cellId : 0;
  return buildLegacyCellKey(workDate, legacyCellId);
}

function orphanScheduleId(list: AppClockPunchResult[], shiftKey: string): string {
  const punch = list[0];
  if (!punch) return shiftKey;
  if (isLikelyFieldJobPunch(punch) && punch.refId != null) {
    return String(punch.refId);
  }
  const cellId = Number(punch.publishedCellId);
  if (Number.isFinite(cellId) && cellId > 0) return String(cellId);
  return shiftKey;
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

/** 按班次快照聚合打卡，最终按当天任务计划开始时刻排序（店班与外勤混排） */
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
  for (const key of orphanKeys) {
    const list = punchByKey.get(key) ?? [];
    groups.push(collectGroup(orphanScheduleId(list, key), key, null, list));
  }

  return groups.sort(compareGroupsByTaskTime);
}
