import type { ShiftPunchRecord } from '../api/types';
import type { LeaveRequest } from '../context/AuthContext';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import { hasOpenMissedPunchOnShift } from './missedPunchEligibility';
import { hasAnyShiftPunch } from './shiftLeaveEligibility';
import {
  bindingMatchesTarget,
  buildShiftKeyFromTarget,
  shiftMatchTargetFromSlot,
  type ShiftMatchTarget,
} from './shiftIdentity';

/** 待审批或已通过的请假视为占用该班次，拒绝后可再申请 */
export function isLeaveRequestBlocking(status: LeaveRequest['status']): boolean {
  return status === 'pending' || status === 'approved';
}

function toTarget(
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): ShiftMatchTarget {
  if ('scheduledRange' in slotOrTarget && 'workDate' in slotOrTarget) {
    return slotOrTarget as ShiftMatchTarget;
  }
  return shiftMatchTargetFromSlot(workDate, slotOrTarget as MyPublishedShiftSlot);
}

export function findOpenLeaveRequestForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): LeaveRequest | undefined {
  const target = toTarget(workDate, slotOrTarget);
  return requests.find((r) => {
    if (r.type !== 'leave' || !isLeaveRequestBlocking(r.status)) return false;
    return r.shifts.some((s) => bindingMatchesTarget(s, target));
  });
}

export function hasOpenLeaveForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  return !!findOpenLeaveRequestForShift(requests, workDate, slotOrTarget);
}

/** 排班卡展示：该班次关联的待审批/已通过请假状态 */
export type ShiftLeaveRequestStatus = 'none' | 'pending' | 'approved';

export function getShiftLeaveRequestStatus(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): ShiftLeaveRequestStatus {
  const req = findOpenLeaveRequestForShift(requests, workDate, slotOrTarget);
  if (!req) return 'none';
  return req.status === 'approved' ? 'approved' : 'pending';
}

/** 该班次在请假申请中是否为整段（优先子项 leaveScope，其次 leaveTime） */
export function isFullLeaveForShiftInRequest(
  request: LeaveRequest,
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  const target = toTarget(workDate, slotOrTarget);
  const binding = request.shifts.find((s) => bindingMatchesTarget(s, target));
  if (!binding) return false;
  if (binding.leaveScope === 'partial') return false;
  if (binding.leaveScope === 'full') return true;
  if (binding.leaveEffect === 'late_in' || binding.leaveEffect === 'early_out') return false;
  if (binding.leaveEffect === 'full') return true;
  if (request.leaveTime?.mode === 'partial') return false;
  return (request.leaveTime?.mode ?? 'full') === 'full';
}

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function classifyPartialLeaveEffect(
  fromHm: string,
  toHm: string,
  shiftRange: string,
): 'late_in' | 'early_out' | null {
  const rangeMatch = /(\d{1,2}:\d{2}).*?[–—−‐‑‒-].*?(\d{1,2}:\d{2})/.exec(
    shiftRange.replace(/\s+/g, ' ').trim(),
  );
  if (!rangeMatch) return null;
  const startMin = hmToMinutes(rangeMatch[1]);
  const endMin = hmToMinutes(rangeMatch[2]);
  const fromMin = hmToMinutes(fromHm);
  const toMin = hmToMinutes(toHm);
  if (startMin == null || endMin == null || fromMin == null || toMin == null) return null;
  if (fromMin === startMin && toMin === endMin) return null;
  // 对齐后端 AttendanceClockLinkageService.resolveLeaveEffect
  if (fromMin > startMin && (toMin === endMin || toMin > startMin)) return 'late_in';
  if (fromMin === startMin && toMin < endMin) return 'early_out';
  return null;
}

/** 已通过部分请假对打卡窗的调整（对齐后端 AppClockPunchService.validateTimeWindow） */
export type LeavePunchWindowAdjust = {
  effect: 'late_in' | 'early_out';
  fromHm: string;
  toHm: string;
  partialFromMin: number;
  partialToMin: number;
};

/**
 * 已审批部分请假：晚来放宽上班最早时刻；早走放宽下班最早时刻。
 * 整段请假或待审不返回（整段由 Hero 排除；待审仍按原排班窗）。
 */
export function getApprovedLeavePunchWindowAdjust(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): LeavePunchWindowAdjust | undefined {
  const target = toTarget(workDate, slotOrTarget);
  const req = requests.find((r) => {
    if (r.type !== 'leave' || r.status !== 'approved') return false;
    return r.shifts.some((s) => bindingMatchesTarget(s, target));
  });
  if (!req || isFullLeaveForShiftInRequest(req, workDate, slotOrTarget)) return undefined;

  const binding = req.shifts.find((s) => bindingMatchesTarget(s, target));
  const fromHm =
    binding?.partialStartTime ??
    (req.leaveTime?.mode === 'partial' ? req.leaveTime.from : undefined);
  const toHm =
    binding?.partialEndTime ??
    (req.leaveTime?.mode === 'partial' ? req.leaveTime.to : undefined);
  if (!fromHm || !toHm) return undefined;

  const range =
    ('range' in slotOrTarget && typeof (slotOrTarget as { range?: string }).range === 'string'
      ? (slotOrTarget as { range: string }).range
      : undefined) ??
    binding?.scheduledRange ??
    '';
  const effectRaw = (binding?.leaveEffect ?? '').toLowerCase();
  const effect =
    effectRaw === 'late_in' || effectRaw === 'early_out'
      ? effectRaw
      : classifyPartialLeaveEffect(fromHm, toHm, range);
  if (!effect) return undefined;

  const partialFromMin = hmToMinutes(fromHm);
  const partialToMin = hmToMinutes(toHm);
  if (partialFromMin == null || partialToMin == null) return undefined;
  return { effect, fromHm, toHm, partialFromMin, partialToMin };
}

/** 待审批/已通过的整段请假占用班次时，不可再提交漏打卡 */
export function hasOpenFullLeaveForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  const req = findOpenLeaveRequestForShift(requests, workDate, slotOrTarget);
  if (!req) return false;
  return isFullLeaveForShiftInRequest(req, workDate, slotOrTarget);
}

export function isMissedPunchBlockedByLeave(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  return hasOpenFullLeaveForShift(requests, workDate, slotOrTarget);
}

export type ShiftLeaveBlockReason = 'none' | 'leave_pending' | 'punch_or_missed_covered';

export function getShiftLeaveBlockReason(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  scheduledRange: string,
  punchCovered: boolean,
  missedPunchCovered: boolean,
): ShiftLeaveBlockReason {
  if (hasOpenLeaveForShift(requests, workDate, slotOrTarget)) return 'leave_pending';
  if (punchCovered || missedPunchCovered) return 'punch_or_missed_covered';
  return 'none';
}

export type FullLeaveBlockReason = 'none' | 'punch_record' | 'missed_punch_open';

/** 有上班/下班打卡，或有未取消、未拒绝的漏打卡时，不可整段班次请假 */
export function getFullLeaveBlockReason(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punch: ShiftPunchRecord | undefined,
): FullLeaveBlockReason {
  if (hasAnyShiftPunch(punch)) return 'punch_record';
  if (hasOpenMissedPunchOnShift(requests, workDate, slotOrTarget)) return 'missed_punch_open';
  return 'none';
}

export function isFullLeaveBlockedForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punch: ShiftPunchRecord | undefined,
): boolean {
  return getFullLeaveBlockReason(requests, workDate, slotOrTarget, punch) !== 'none';
}
