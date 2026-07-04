import type { LeaveRequest } from '../context/AuthContext';
import type { TimelineFieldJobItem } from '../types/fieldService';
import { calendarDateKey, normalizeDateKey } from './calendarDateKey';
import {
  findApprovedLeaveCoveringFieldJob,
  findLeaveCoveringFieldJob,
  findPendingLeaveCoveringFieldJob,
} from './fieldLeaveEligibility';
import { compareDateKeys } from './localDateTime';
import { getApproximateServerNowDate } from './serverClock';
import { isMissedPunchRequestBlocking } from './missedPunchEligibility';

export const FIELD_PUNCH_OUT_LATE_MINUTES = 30;

function parseHm(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function jobHm(value: string): string {
  const s = value.trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
    }
  }
  return s.slice(0, 5);
}

export function fieldJobWorkDate(job: TimelineFieldJobItem): string {
  const start = job.start?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}/.test(start)) return start.slice(0, 10);
  return calendarDateKey(getApproximateServerNowDate());
}

export function fieldJobScheduledRange(job: TimelineFieldJobItem): string {
  return `${jobHm(job.start)}–${jobHm(job.end)}`;
}

function dateAtMinutes(workDateIso: string, minutes: number, dayOffset = 0): Date | null {
  const workDate = normalizeDateKey(workDateIso);
  if (!workDate) return null;
  const [y, m, d] = workDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + dayOffset, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function fieldMissedEligibleAfter(job: TimelineFieldJobItem, punchKind: 'in' | 'out'): Date | null {
  const workDate = fieldJobWorkDate(job);
  const startMin = parseHm(jobHm(job.start));
  const endMin = parseHm(jobHm(job.end));
  if (startMin == null || endMin == null) return null;
  const overnight = endMin <= startMin;
  if (punchKind === 'in') {
    return dateAtMinutes(workDate, startMin, 0);
  }
  return dateAtMinutes(workDate, endMin, overnight ? 1 : 0);
}

export function canApplyFieldMissedPunchKind(
  job: TimelineFieldJobItem,
  punchKind: 'in' | 'out',
  now: Date = getApproximateServerNowDate(),
  todayIso: string = calendarDateKey(now),
): boolean {
  const workDate = fieldJobWorkDate(job);
  if (compareDateKeys(workDate, todayIso) > 0) return false;
  const eligibleAfter = fieldMissedEligibleAfter(job, punchKind);
  if (!eligibleAfter) return false;
  if (compareDateKeys(workDate, todayIso) < 0) return true;
  return now.getTime() >= eligibleAfter.getTime();
}

/** 外勤上班漏打卡是否可申请（缺卡、无占用申请、已过可申请时刻） */
export function canApplyFieldMissedPunchIn(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
  now: Date = getApproximateServerNowDate(),
): boolean {
  if (job.leaveApproved || findLeaveCoveringFieldJob(requests, job.id)) return false;
  if (job.fieldClockInAt) return false;
  if (findOpenFieldMissedPunchRequest(requests, job.id, 'in')) return false;
  return canApplyFieldMissedPunchKind(job, 'in', now, calendarDateKey(now));
}

/** 外勤下班漏打卡是否可申请（缺卡、无占用申请、已过可申请时刻；不要求已打上班卡） */
export function canApplyFieldMissedPunchOut(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
  now: Date = getApproximateServerNowDate(),
): boolean {
  if (job.leaveApproved || findLeaveCoveringFieldJob(requests, job.id)) return false;
  if (job.fieldClockOutAt) return false;
  if (findOpenFieldMissedPunchRequest(requests, job.id, 'out')) return false;
  return canApplyFieldMissedPunchKind(job, 'out', now, calendarDateKey(now));
}

export function preferredFieldMissedPunchKind(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
  now: Date = getApproximateServerNowDate(),
): 'in' | 'out' | null {
  if (canApplyFieldMissedPunchIn(job, requests, now)) return 'in';
  if (canApplyFieldMissedPunchOut(job, requests, now)) return 'out';
  return null;
}

export function canApplyFieldMissedPunch(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
  now: Date = getApproximateServerNowDate(),
): boolean {
  return preferredFieldMissedPunchKind(job, requests, now) != null;
}

/** 是否已过外勤计划结束时刻（可开始完成打卡） */
export function isPastFieldScheduledEnd(
  job: TimelineFieldJobItem,
  now: Date = getApproximateServerNowDate(),
): boolean {
  const workDate = fieldJobWorkDate(job);
  const todayIso = calendarDateKey(now);
  if (compareDateKeys(workDate, todayIso) < 0) return true;
  if (compareDateKeys(workDate, todayIso) > 0) return false;
  const endAt = fieldMissedEligibleAfter(job, 'out');
  return endAt != null && now.getTime() >= endAt.getTime();
}

/** 是否处于外勤完成打卡窗口（计划结束 ~ 结束+宽限） */
export function isInFieldOutPunchWindow(
  job: TimelineFieldJobItem,
  now: Date = getApproximateServerNowDate(),
): boolean {
  const endAt = fieldMissedEligibleAfter(job, 'out');
  if (!endAt) return false;
  const windowEnd = new Date(endAt.getTime() + FIELD_PUNCH_OUT_LATE_MINUTES * 60_000);
  return now.getTime() >= endAt.getTime() && now.getTime() <= windowEnd.getTime();
}

function fieldScheduledStartAt(job: TimelineFieldJobItem): Date | null {
  const startRaw = job.start?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(startRaw)) {
    const ms = Date.parse(startRaw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return fieldMissedEligibleAfter(job, 'in');
}

/** 当前是否尚未到外勤计划开始时刻 */
export function isBeforeFieldScheduledStart(
  job: TimelineFieldJobItem,
  now: Date = getApproximateServerNowDate(),
): boolean {
  const workDate = fieldJobWorkDate(job);
  const todayIso = calendarDateKey(now);
  if (compareDateKeys(workDate, todayIso) > 0) return true;
  if (compareDateKeys(workDate, todayIso) < 0) return false;
  const startAt = fieldScheduledStartAt(job);
  return startAt != null && now.getTime() < startAt.getTime();
}

export function findOpenFieldMissedPunchRequest(
  requests: LeaveRequest[],
  fieldJobId: string,
  punchKind: 'in' | 'out',
): LeaveRequest | undefined {
  const id = fieldJobId.trim();
  if (!id) return undefined;
  return requests.find((r) => {
    if (r.type !== 'missed_punch' || !isMissedPunchRequestBlocking(r.status)) return false;
    if (r.fieldJob?.id !== id) return false;
    return r.missedPunch?.punchKind === punchKind;
  });
}

/** 该类型外勤卡是否已满足（实打卡或漏打卡已通过） */
export function fieldPunchKindSatisfied(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[],
  punchKind: 'in' | 'out',
): boolean {
  if (punchKind === 'in' && !!job.fieldClockInAt) return true;
  if (punchKind === 'out' && !!job.fieldClockOutAt) return true;
  return findOpenFieldMissedPunchRequest(requests, job.id, punchKind)?.status === 'approved';
}

export function isFieldJobFullyPunched(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[],
): boolean {
  return (
    fieldPunchKindSatisfied(job, requests, 'in') && fieldPunchKindSatisfied(job, requests, 'out')
  );
}

export type FieldJobDisplayState =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'missed_punch_pending'
  | 'missed_punch_partial'
  | 'missed_punch_approved'
  | 'leave_pending'
  | 'leave_approved';

export function getFieldJobDisplayState(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[],
  now: Date = getApproximateServerNowDate(),
): FieldJobDisplayState {
  // 店班请假含此外勤 / 独立外勤请假：不应再显示「未开始」
  if (job.leaveApproved || findApprovedLeaveCoveringFieldJob(requests, job.id)) {
    return 'leave_approved';
  }
  if (findPendingLeaveCoveringFieldJob(requests, job.id)) {
    return 'leave_pending';
  }
  const hasIn = !!job.fieldClockInAt;
  const hasOut = !!job.fieldClockOutAt;
  if (hasIn && hasOut) return 'completed';

  if (isFieldJobFullyPunched(job, requests)) {
    return 'missed_punch_approved';
  }

  const inOpen = findOpenFieldMissedPunchRequest(requests, job.id, 'in');
  const outOpen = findOpenFieldMissedPunchRequest(requests, job.id, 'out');
  if (inOpen || outOpen) {
    const canIn = canApplyFieldMissedPunchIn(job, requests, now);
    const canOut = canApplyFieldMissedPunchOut(job, requests, now);
    if (canIn || canOut) return 'incomplete';
    if (inOpen?.status === 'pending' || outOpen?.status === 'pending') {
      return 'missed_punch_pending';
    }
    if (
      fieldPunchKindSatisfied(job, requests, 'in') !== fieldPunchKindSatisfied(job, requests, 'out')
    ) {
      return 'missed_punch_partial';
    }
    return 'missed_punch_pending';
  }

  if (!hasIn && !hasOut && isBeforeFieldScheduledStart(job, now)) {
    return 'not_started';
  }

  const workDate = fieldJobWorkDate(job);
  const todayIso = calendarDateKey(now);
  const endEligible = fieldMissedEligibleAfter(job, 'out');
  const outWindowEnd =
    endEligible != null
      ? new Date(endEligible.getTime() + FIELD_PUNCH_OUT_LATE_MINUTES * 60_000)
      : null;
  const pastOutWindow =
    outWindowEnd != null &&
    (compareDateKeys(workDate, todayIso) < 0 || now.getTime() > outWindowEnd.getTime());

  if ((!hasIn || (!hasOut && pastOutWindow)) && compareDateKeys(workDate, todayIso) <= 0) {
    const canIn = !hasIn && canApplyFieldMissedPunchKind(job, 'in', now, todayIso);
    const canOut = !hasOut && canApplyFieldMissedPunchKind(job, 'out', now, todayIso);
    if (!hasIn && isBeforeFieldScheduledStart(job, now)) return 'not_started';
    if (!hasIn && !canIn && compareDateKeys(workDate, todayIso) <= 0) return 'incomplete';
    if (!hasOut && pastOutWindow && !canOut) return 'incomplete';
    if (!hasIn && canIn) return 'not_started';
    if (!hasOut && pastOutWindow) return 'incomplete';
  }

  if (hasIn && !hasOut) return 'in_progress';
  return 'not_started';
}

/** Hero「服务中」：已打外勤上班、未下班，且尚未到计划结束（请假已通过的不参与 Hero） */
export function shouldShowFieldHeroInService(
  job: TimelineFieldJobItem,
  now: Date = getApproximateServerNowDate(),
): boolean {
  if (job.leaveApproved) return false;
  return !!job.fieldClockInAt && !job.fieldClockOutAt && !isPastFieldScheduledEnd(job, now);
}

export function isStoreMissedPunchBlockedByFieldSync(
  linkedFieldJobs: TimelineFieldJobItem[],
  punchKind: 'in' | 'out',
  storeHasPunch: boolean,
): boolean {
  if (storeHasPunch) return false;
  return linkedFieldJobs.some((job) =>
    punchKind === 'in' ? job.syncStoreClockIn : job.syncStoreClockOut,
  );
}

export function storeMissedPunchKindsBlockedByFieldSync(
  linkedFieldJobs: TimelineFieldJobItem[],
  punch: { clockInAt?: string | null; clockOutAt?: string | null } | undefined,
): { in: boolean; out: boolean } {
  return {
    in: isStoreMissedPunchBlockedByFieldSync(linkedFieldJobs, 'in', !!punch?.clockInAt),
    out: isStoreMissedPunchBlockedByFieldSync(linkedFieldJobs, 'out', !!punch?.clockOutAt),
  };
}

export function shouldHideStoreMissedPunchApply(
  linkedFieldJobs: TimelineFieldJobItem[],
  punch: { clockInAt?: string | null; clockOutAt?: string | null } | undefined,
  canApplyIn: boolean,
  canApplyOut: boolean,
): boolean {
  if (!linkedFieldJobs.length) return false;
  const syncBlocks = storeMissedPunchKindsBlockedByFieldSync(linkedFieldJobs, punch);
  const blockedIn = canApplyIn && syncBlocks.in;
  const blockedOut = canApplyOut && syncBlocks.out;
  if (!blockedIn && !blockedOut) return false;
  if (blockedIn && blockedOut) return true;
  if (blockedIn && !canApplyOut) return true;
  if (blockedOut && !canApplyIn) return true;
  return false;
}
