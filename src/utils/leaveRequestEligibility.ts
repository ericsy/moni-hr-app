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

/** 该班次在请假申请中是否为整段（单段请假或无法区分时按整段） */
export function isFullLeaveForShiftInRequest(
  request: LeaveRequest,
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  const target = toTarget(workDate, slotOrTarget);
  const inRequest = request.shifts.some((s) => bindingMatchesTarget(s, target));
  if (!inRequest) return false;
  if (request.shifts.length === 1) {
    return (request.leaveTime?.mode ?? 'full') === 'full';
  }
  return (request.leaveTime?.mode ?? 'full') === 'full';
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
