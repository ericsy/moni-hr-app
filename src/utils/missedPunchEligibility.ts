import type { LeaveRequest } from '../context/AuthContext';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import { compareHm, parseScheduledHmRange } from './localDateTime';
import { isClockInWithinLateGrace } from './shiftLeaveEligibility';
import {
  bindingMatchesTarget,
  shiftMatchTargetFromSlot,
  type ShiftMatchTarget,
} from './shiftIdentity';

/** 待审批或已通过的漏打卡申请视为占用，拒绝后可再次申请 */
export function isMissedPunchRequestBlocking(status: LeaveRequest['status']): boolean {
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

export function findOpenMissedPunchRequest(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punchKind: 'in' | 'out',
): LeaveRequest | undefined {
  const target = toTarget(workDate, slotOrTarget);
  return requests.find((r) => {
    if (r.type !== 'missed_punch' || !isMissedPunchRequestBlocking(r.status)) return false;
    const shift = r.shifts[0];
    if (!shift || !bindingMatchesTarget(shift, target)) return false;
    return r.missedPunch?.punchKind === punchKind;
  });
}

export function hasOpenMissedPunchForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punchKind: 'in' | 'out',
): boolean {
  return !!findOpenMissedPunchRequest(requests, workDate, slotOrTarget, punchKind);
}

/** 该班次是否存在待审批或已通过的漏打卡（上班或下班任一） */
export function hasOpenMissedPunchOnShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  return (
    hasOpenMissedPunchForShift(requests, workDate, slotOrTarget, 'in') ||
    hasOpenMissedPunchForShift(requests, workDate, slotOrTarget, 'out')
  );
}

/** 上班、下班漏打卡均已有待审批或已通过申请时，不可再提交漏打卡 */
export function isMissedPunchFullyBlockedForShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): boolean {
  return (
    hasOpenMissedPunchForShift(requests, workDate, slotOrTarget, 'in') &&
    hasOpenMissedPunchForShift(requests, workDate, slotOrTarget, 'out')
  );
}

export function getOpenMissedPunchProposedTime(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punchKind: 'in' | 'out',
): string | undefined {
  const req = findOpenMissedPunchRequest(requests, workDate, slotOrTarget, punchKind);
  const hm = req?.missedPunch?.proposedTime?.trim();
  return hm || undefined;
}

/**
 * 待审批/已通过的上下班漏打卡申请时间是否覆盖计划班次（与实打卡覆盖规则一致）。
 */
export function doesOpenMissedPunchCoverScheduledShift(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  scheduledRange: string,
): boolean {
  const inHm = getOpenMissedPunchProposedTime(requests, workDate, slotOrTarget, 'in');
  const outHm = getOpenMissedPunchProposedTime(requests, workDate, slotOrTarget, 'out');
  if (!inHm || !outHm) return false;
  const bounds = parseScheduledHmRange(scheduledRange);
  if (!bounds) return false;
  return (
    isClockInWithinLateGrace(inHm, bounds.start) &&
    compareHm(outHm, bounds.end) >= 0
  );
}

export function isShiftLeaveBlockedByMissedPunch(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  scheduledRange: string,
): boolean {
  return doesOpenMissedPunchCoverScheduledShift(requests, workDate, slotOrTarget, scheduledRange);
}

export type MissedPunchPendingStatus = 'none' | 'partial' | 'full';

export type ShiftMissedPunchOpenStatus = {
  coverage: 'partial' | 'full';
  approval: 'pending' | 'approved';
};

function missedPunchOpenApproval(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
  punchKind: 'in' | 'out',
): 'none' | 'pending' | 'approved' {
  const req = findOpenMissedPunchRequest(requests, workDate, slotOrTarget, punchKind);
  if (!req) return 'none';
  return req.status === 'approved' ? 'approved' : 'pending';
}

/** 排班卡状态：是否已有待审批/已通过的漏打卡申请 */
export function getMissedPunchPendingStatus(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): MissedPunchPendingStatus {
  const open = getShiftMissedPunchOpenStatus(requests, workDate, slotOrTarget);
  return open?.coverage ?? 'none';
}

/** 排班卡展示：漏打卡申请覆盖范围与审批状态 */
export function getShiftMissedPunchOpenStatus(
  requests: LeaveRequest[],
  workDate: string,
  slotOrTarget: ShiftMatchTarget | Pick<MyPublishedShiftSlot, 'id' | 'range' | 'areaName' | 'shiftName'>,
): ShiftMissedPunchOpenStatus | undefined {
  const inApproval = missedPunchOpenApproval(requests, workDate, slotOrTarget, 'in');
  const outApproval = missedPunchOpenApproval(requests, workDate, slotOrTarget, 'out');
  if (inApproval === 'none' && outApproval === 'none') return undefined;
  const coverage = inApproval !== 'none' && outApproval !== 'none' ? 'full' : 'partial';
  const approval =
    inApproval === 'pending' || outApproval === 'pending' ? 'pending' : 'approved';
  return { coverage, approval };
}
