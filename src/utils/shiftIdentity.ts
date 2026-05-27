import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { RequestShiftBinding } from '../context/AuthContext';
import type { AppAttendanceLeaveItem, AppAttendanceRequest, AppClockPunchResult } from '../api/types';
import type { ShiftPunchRecord } from '../api/types';
import { formatHm, parseHm, parseScheduledHmRange } from './localDateTime';

/** 班次业务身份：日期 + 计划起止时刻（同人同时段仅一班） */
export type ShiftIdentity = {
  workDate: string;
  startTime: string;
  endTime: string;
};

export type ShiftMatchTarget = {
  workDate: string;
  /** 当前排班格子 id（仅提交打卡/申请时用） */
  scheduleId?: string;
  scheduledRange: string;
};

function normalizeDateKey(value?: string | null): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizeHmValue(value?: string | null): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const { hour, minute } = parseHm(s);
    return formatHm(hour, minute);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return formatHm(d.getHours(), d.getMinutes());
  }
  return '';
}

export function identityFromTimes(
  workDate: string,
  startTime: string,
  endTime: string,
): ShiftIdentity | null {
  const date = normalizeDateKey(workDate);
  const start = normalizeHmValue(startTime);
  const end = normalizeHmValue(endTime);
  if (!date || !start || !end) return null;
  return { workDate: date, startTime: start, endTime: end };
}

export function identityFromScheduledRange(
  workDate: string,
  scheduledRange: string,
): ShiftIdentity | null {
  const bounds = parseScheduledHmRange(scheduledRange);
  if (!bounds) return null;
  return identityFromTimes(workDate, bounds.start, bounds.end);
}

export function identityFromPublishedSlot(workDate: string, slot: MyPublishedShiftSlot): ShiftIdentity | null {
  return identityFromScheduledRange(workDate, slot.range);
}

export function shiftMatchTargetFromSlot(workDate: string, slot: MyPublishedShiftSlot): ShiftMatchTarget {
  return {
    workDate,
    scheduleId: slot.id,
    scheduledRange: slot.range,
  };
}

function rawPunchScheduleDate(p: AppClockPunchResult): string {
  const row = p as AppClockPunchResult & {
    schedule_date?: string;
    shift_start_time?: string;
    shift_end_time?: string;
  };
  return (p.scheduleDate ?? row.schedule_date ?? '').trim();
}

function rawPunchStart(p: AppClockPunchResult): string {
  const row = p as AppClockPunchResult & { shift_start_time?: string };
  return (p.shiftStartTime ?? row.shift_start_time ?? '').trim();
}

function rawPunchEnd(p: AppClockPunchResult): string {
  const row = p as AppClockPunchResult & { shift_end_time?: string };
  return (p.shiftEndTime ?? row.shift_end_time ?? '').trim();
}

/** 打卡记录快照 → 班次身份（无快照时退回 cell id） */
export function identityFromPunch(p: AppClockPunchResult, fallbackWorkDate: string): ShiftIdentity | null {
  const workDate = normalizeDateKey(rawPunchScheduleDate(p)) || normalizeDateKey(fallbackWorkDate);
  return identityFromTimes(workDate, rawPunchStart(p), rawPunchEnd(p));
}

export function identityFromLeaveItem(item: AppAttendanceLeaveItem): ShiftIdentity | null {
  return identityFromTimes(item.scheduleDate ?? '', item.shiftStartTime ?? '', item.shiftEndTime ?? '');
}

export function identityFromMissedPunchRow(row: AppAttendanceRequest): ShiftIdentity | null {
  return identityFromTimes(row.scheduleDate ?? '', row.shiftStartTime ?? '', row.shiftEndTime ?? '');
}

export function identityFromBinding(shift: RequestShiftBinding): ShiftIdentity | null {
  if (shift.shiftKey?.startsWith('t:')) {
    const parts = shift.shiftKey.slice(2).split('|');
    if (parts.length >= 3) {
      return identityFromTimes(parts[0], parts[1], parts[2]);
    }
  }
  return identityFromScheduledRange(shift.workDate, shift.scheduledRange);
}

/** 班次匹配键：仅日期 + 计划开始 + 计划结束 */
export function buildShiftIdentityKey(identity: ShiftIdentity): string {
  return `t:${identity.workDate}|${identity.startTime}|${identity.endTime}`;
}

/** 无时段快照时仅用格子 id（重发布后可能无法与当前排班对齐） */
export function buildLegacyCellKey(workDate: string, publishedCellId: number | string): string {
  return `cell:${normalizeDateKey(workDate)}|${publishedCellId}`;
}

export function buildShiftKeyFromTarget(target: ShiftMatchTarget): string {
  const identity = identityFromScheduledRange(target.workDate, target.scheduledRange);
  if (identity) return buildShiftIdentityKey(identity);
  if (target.scheduleId) return buildLegacyCellKey(target.workDate, target.scheduleId);
  return '';
}

export function buildShiftKeyFromBinding(shift: RequestShiftBinding): string {
  const identity = identityFromBinding(shift);
  if (identity) return buildShiftIdentityKey(identity);
  if (shift.scheduleId) return buildLegacyCellKey(shift.workDate, shift.scheduleId);
  return '';
}

export function bindingMatchesTarget(binding: RequestShiftBinding, target: ShiftMatchTarget): boolean {
  if (binding.workDate !== target.workDate) return false;
  const bindingKey = buildShiftKeyFromBinding(binding);
  const targetKey = buildShiftKeyFromTarget(target);
  if (bindingKey && targetKey && bindingKey === targetKey) return true;
  if (
    bindingKey.startsWith('cell:') &&
    target.scheduleId &&
    bindingKey === buildLegacyCellKey(target.workDate, target.scheduleId)
  ) {
    return true;
  }
  return false;
}

export function punchRecordMatchesTarget(record: ShiftPunchRecord, target: ShiftMatchTarget): boolean {
  if (record.workDate !== target.workDate) return false;
  const recordKey = record.shiftKey;
  const targetKey = buildShiftKeyFromTarget(target);
  if (recordKey && targetKey && recordKey === targetKey) return true;
  if (
    recordKey?.startsWith('cell:') &&
    target.scheduleId &&
    recordKey === buildLegacyCellKey(target.workDate, target.scheduleId)
  ) {
    return true;
  }
  return !!(target.scheduleId && record.scheduleId === target.scheduleId);
}

export function formatRangeFromIdentity(identity: ShiftIdentity): string {
  return `${identity.startTime}–${identity.endTime}`;
}

export function scheduledRangeFromPunch(p: AppClockPunchResult, fallbackWorkDate: string): string {
  const identity = identityFromPunch(p, fallbackWorkDate);
  if (identity) return formatRangeFromIdentity(identity);
  return '';
}

/** 绑定当前排班格子（提交 API 仍用 publishedCellId） */
export function attachScheduleIdToBinding(
  shift: RequestShiftBinding,
  scheduleId: string,
): RequestShiftBinding {
  const shiftKey = buildShiftKeyFromBinding(shift) || buildLegacyCellKey(shift.workDate, scheduleId);
  return { ...shift, scheduleId, shiftKey };
}
