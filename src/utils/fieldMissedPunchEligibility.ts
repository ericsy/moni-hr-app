import type { LeaveRequest } from '../context/AuthContext';
import type { TimelineFieldJobItem } from '../types/fieldService';
import { calendarDateKey, normalizeDateKey } from './calendarDateKey';
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

export function canApplyFieldMissedPunch(job: TimelineFieldJobItem, now = getApproximateServerNowDate()): boolean {
  const todayIso = calendarDateKey(now);
  const hasIn = !!job.fieldClockInAt;
  const hasOut = !!job.fieldClockOutAt;
  if (!hasIn && canApplyFieldMissedPunchKind(job, 'in', now, todayIso)) return true;
  if (hasIn && !hasOut && canApplyFieldMissedPunchKind(job, 'out', now, todayIso)) return true;
  return false;
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

export type FieldJobDisplayState =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'missed_punch_pending'
  | 'missed_punch_approved';

export function getFieldJobDisplayState(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[],
  now: Date = getApproximateServerNowDate(),
): FieldJobDisplayState {
  const hasIn = !!job.fieldClockInAt;
  const hasOut = !!job.fieldClockOutAt;
  if (hasIn && hasOut) return 'completed';

  const inOpen = findOpenFieldMissedPunchRequest(requests, job.id, 'in');
  const outOpen = findOpenFieldMissedPunchRequest(requests, job.id, 'out');
  if (inOpen || outOpen) {
    const approval =
      inOpen?.status === 'approved' || outOpen?.status === 'approved' ? 'approved' : 'pending';
    return approval === 'approved' && hasIn && hasOut
      ? 'completed'
      : approval === 'approved'
        ? 'missed_punch_approved'
        : 'missed_punch_pending';
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
    const canOut = hasIn && !hasOut && canApplyFieldMissedPunchKind(job, 'out', now, todayIso);
    if (!hasIn && !canIn && compareDateKeys(workDate, todayIso) <= 0) return 'incomplete';
    if (hasIn && !hasOut && pastOutWindow && !canOut) return 'incomplete';
    if (!hasIn && canIn) return 'not_started';
    if (hasIn && !hasOut && pastOutWindow) return 'incomplete';
  }

  if (hasIn && !hasOut) return 'in_progress';
  return 'not_started';
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
