import type { LeaveRequest, LeaveTimeSpan, RequestShiftBinding } from '../context/AuthContext';
import type {
  AppAttendanceLeaveItem,
  AppAttendanceLeaveItemRequest,
  AppAttendanceRequest,
  AppAttendanceRequestCreate,
  MerchantAttendanceRequest,
  MerchantEmployeeBrief,
} from './types';
import { calendarDateKey } from '../utils/calendarDateKey';
import { formatHm, parseHm } from '../utils/localDateTime';
import {
  buildShiftIdentityKey,
  formatRangeFromIdentity,
  identityFromLeaveItem,
  identityFromMissedPunchRow,
} from '../utils/shiftIdentity';
import { shiftSelectionKeyFromBinding } from '../utils/requestShiftBinding';

function normalizeStatus(raw: string): LeaveRequest['status'] {
  const s = raw?.toLowerCase() ?? '';
  if (s === 'approved' || s === 'reviewed') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'pending';
}

function normalizeRequestType(raw: string): LeaveRequest['type'] {
  return raw === 'missed_punch' ? 'missed_punch' : 'leave';
}

/** 提交用：空、省略号占位等视为未填写 */
export function normalizeSubmitReason(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (text === '…' || text === '...' || text === '—' || text === '-') return '';
  return text;
}

function formatShiftRangeTimes(start?: string | null, end?: string | null): string {
  const s = (start ?? '').trim();
  const e = (end ?? '').trim();
  if (s && e) return `${s}–${e}`;
  return s || e || '—';
}

function formatShiftRangeFromItem(item: AppAttendanceLeaveItem): string {
  return formatShiftRangeTimes(item.shiftStartTime, item.shiftEndTime);
}

function scheduleDateKeyFrom(value?: string | null): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function mapLeaveItemToBinding(item: AppAttendanceLeaveItem, index: number): RequestShiftBinding {
  const workDate = scheduleDateKeyFrom(item.scheduleDate);
  const identity = identityFromLeaveItem(item);
  const scheduledRange = identity
    ? formatRangeFromIdentity(identity)
    : formatShiftRangeFromItem(item);
  const shiftKey = identity
    ? buildShiftIdentityKey(identity)
    : workDate
      ? `cell:${workDate}|${item.publishedCellId}`
      : undefined;
  return {
    workDate,
    slotIndex: index,
    scheduleId: String(item.publishedCellId),
    shiftKey,
    areaName: '—',
    shiftName: '—',
    scheduledRange,
  };
}

function mapMissedPunchBinding(row: AppAttendanceRequest): RequestShiftBinding | null {
  if (row.fieldJobId != null) return null;
  if (row.publishedCellId == null) return null;
  const workDate =
    scheduleDateKeyFrom(row.scheduleDate) ||
    scheduleDateKeyFrom(row.leaveItems?.[0]?.scheduleDate) ||
    (() => {
      if (!row.actualPunchedAt) return '';
      const d = new Date(row.actualPunchedAt);
      if (!Number.isNaN(d.getTime())) return calendarDateKey(d);
      return String(row.actualPunchedAt).slice(0, 10);
    })();
  const scheduledRange =
    formatShiftRangeTimes(row.shiftStartTime, row.shiftEndTime) !== '—'
      ? formatShiftRangeTimes(row.shiftStartTime, row.shiftEndTime)
      : row.leaveItems?.[0]
        ? formatShiftRangeFromItem(row.leaveItems[0])
        : '—';
  const identity = identityFromMissedPunchRow(row);
  const shiftKey = identity
    ? buildShiftIdentityKey(identity)
    : workDate && row.publishedCellId != null
      ? `cell:${workDate}|${row.publishedCellId}`
      : undefined;
  const range =
    identity && scheduledRange === '—'
      ? formatRangeFromIdentity(identity)
      : scheduledRange;
  return {
    workDate,
    slotIndex: 0,
    scheduleId: row.publishedCellId != null ? String(row.publishedCellId) : undefined,
    shiftKey,
    areaName: '—',
    shiftName: '—',
    scheduledRange: range,
  };
}

function mapFieldMissedPunchMeta(row: AppAttendanceRequest): LeaveRequest['fieldJob'] | undefined {
  if (row.fieldJobId == null) return undefined;
  const scheduledRange = formatShiftRangeTimes(row.shiftStartTime, row.shiftEndTime);
  return {
    id: String(row.fieldJobId),
    customerName: (row.areaName ?? '').trim() || '—',
    serviceAddress: row.serviceAddress?.trim() || undefined,
    scheduledRange: scheduledRange !== '—' ? scheduledRange : '—',
    syncStoreClockIn: row.syncStoreClockIn === true,
    syncStoreClockOut: row.syncStoreClockOut === true,
  };
}

function hmFromIsoOrTime(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const s = value.trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return formatHm(parseHm(s).hour, parseHm(s).minute);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return formatHm(d.getHours(), d.getMinutes());
  }
  return undefined;
}

function leaveDateSpan(shifts: RequestShiftBinding[]): { start: string; end: string } {
  if (shifts.length === 0) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { start: iso, end: iso };
  }
  const sorted = [...shifts].map((s) => s.workDate).filter(Boolean).sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

/** 与后端约定：显式 shift 为按班次；否则有请假起止日时按「按日期请假」处理（避免 leaveMode 缺省仍带出 leaveItems 导致列表显示段数）。 */
function resolveLeaveModeForRow(
  row: AppAttendanceRequest,
  type: ReturnType<typeof normalizeRequestType>,
): 'shift' | 'date_range' {
  if (type !== 'leave') return 'shift';
  const raw = String(row.leaveMode ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (raw === 'date_range' || raw === 'daterange') return 'date_range';
  if (raw === 'shift') return 'shift';
  const from = row.leaveDateFrom?.trim();
  const to = row.leaveDateTo?.trim();
  if (from && to) return 'date_range';
  return 'shift';
}

function mapLeaveTimeFromItems(items: AppAttendanceLeaveItem[]): LeaveTimeSpan | undefined {
  if (items.length !== 1) return undefined;
  const item = items[0];
  const effect = (item.leaveEffect ?? '').toLowerCase();
  const scope = (item.leaveScope ?? '').toLowerCase();
  if (effect === 'full' || (scope === 'full' && !effect)) return { mode: 'full' };
  const from = hmFromIsoOrTime(item.partialStartTime);
  const to = hmFromIsoOrTime(item.partialEndTime);
  if (
    scope === 'partial' ||
    effect === 'partial' ||
    effect === 'late_in' ||
    effect === 'early_out'
  ) {
    if (from && to) return { mode: 'partial', from, to };
  }
  return { mode: 'full' };
}

export function formatEmployeeBrief(person?: MerchantEmployeeBrief | null): string | undefined {
  if (!person) return undefined;
  const name = person.displayName?.trim();
  if (name) return name;
  const parts = [person.firstName, person.lastName].map((s) => s?.trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (person.employeeCode?.trim()) return person.employeeCode.trim();
  if (person.email?.trim()) return person.email.trim();
  return undefined;
}

export type AttendanceRequestDetail = LeaveRequest & {
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  approverKind?: string;
  applicant?: MerchantEmployeeBrief | null;
  approver?: MerchantEmployeeBrief | null;
  reviewer?: MerchantEmployeeBrief | null;
  proxyReviewer?: MerchantEmployeeBrief | null;
  proxyReview?: boolean;
  leaveItemsDetail?: AppAttendanceLeaveItem[];
};

/** API → 详情展示模型 */
export function mapAttendanceRequestDetail(row: MerchantAttendanceRequest): AttendanceRequestDetail {
  const applicantName = formatEmployeeBrief(row.applicant) ?? row.applicantName;
  const base = mapAttendanceRequestToLeaveRequest(row, {
    applicantId:
      row.applicant?.merchantAdminId != null
        ? String(row.applicant.merchantAdminId)
        : row.applicantMerchantAdminId != null
          ? String(row.applicantMerchantAdminId)
          : undefined,
    applicantName,
  });
  return {
    ...base,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    reviewComment: row.reviewComment,
    approverKind: row.approverKind,
    applicant: row.applicant,
    approver: row.approver,
    reviewer: row.reviewer,
    proxyReviewer: row.proxyReviewer,
    proxyReview: row.proxyReview ?? undefined,
    leaveItemsDetail: row.leaveItems,
  };
}

/** API → 列表展示模型 */
export function mapAttendanceRequestToLeaveRequest(
  row: AppAttendanceRequest,
  options?: { applicantId?: string; applicantName?: string },
): LeaveRequest {
  const type = normalizeRequestType(row.requestType);
  const leaveMode = resolveLeaveModeForRow(row, type);
  const leaveItems = row.leaveItems ?? [];

  const shifts =
    type === 'leave' && leaveMode === 'date_range'
      ? []
      : type === 'leave'
      ? leaveItems.map((item, idx) => mapLeaveItemToBinding(item, idx))
      : (() => {
          const binding = mapMissedPunchBinding(row);
          return binding ? [binding] : [];
        })();

  const fieldJob = type === 'missed_punch' ? mapFieldMissedPunchMeta(row) : undefined;
  const missedWorkDate =
    shifts[0]?.workDate || scheduleDateKeyFrom(row.scheduleDate) || '';
  const span =
    type === 'leave' && leaveMode === 'date_range' && row.leaveDateFrom && row.leaveDateTo
      ? { start: String(row.leaveDateFrom).slice(0, 10), end: String(row.leaveDateTo).slice(0, 10) }
      : type === 'missed_punch' && missedWorkDate
      ? { start: missedWorkDate, end: missedWorkDate }
      : leaveDateSpan(shifts);
  const punchKind =
    row.punchType === 'clock_out' || row.punchType === 'clock-out' ? 'out' : 'in';
  const proposedTime = hmFromIsoOrTime(row.actualPunchedAt);

  return {
    id: String(row.id),
    type,
    leaveMode,
    applicantId:
      options?.applicantId ??
      (row.applicantMerchantAdminId != null ? String(row.applicantMerchantAdminId) : undefined),
    applicantName: options?.applicantName ?? row.applicantName,
    storeId: String(row.storeId),
    start: span.start,
    end: span.end,
    reason: normalizeSubmitReason(row.reason ?? '') || '—',
    status: normalizeStatus(row.status),
    shifts,
    leaveTime: type === 'leave' ? mapLeaveTimeFromItems(leaveItems) : undefined,
    missedPunch:
      type === 'missed_punch' && proposedTime
        ? { punchKind, proposedTime }
        : undefined,
    fieldJob,
  };
}

export function toAttendanceDateTimeIso(workDate: string, hm: string): string {
  const { hour, minute } = parseHm(hm);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${workDate}T${pad(hour)}:${pad(minute)}:00`;
}

export function buildLeaveItemsPayload(
  shifts: RequestShiftBinding[],
  options?: {
    leaveTime?: LeaveTimeSpan;
    leaveTimesByScheduleKey?: Record<string, LeaveTimeSpan>;
  },
): AppAttendanceLeaveItemRequest[] {
  const { leaveTime, leaveTimesByScheduleKey } = options ?? {};
  return shifts.map((shift) => {
    const cellId = Number(shift.scheduleId);
    const selectionKey = shiftSelectionKeyFromBinding(shift);
    const span =
      leaveTimesByScheduleKey?.[selectionKey] ??
      leaveTimesByScheduleKey?.[shift.shiftKey ?? `${shift.workDate}|${shift.scheduleId ?? ''}`] ??
      (shifts.length === 1 ? leaveTime : undefined);
    const partial = span?.mode === 'partial' && span.from && span.to;
    const item: AppAttendanceLeaveItemRequest = {
      publishedCellId: cellId,
      leaveScope: partial ? 'partial' : 'full',
    };
    if (!Number.isFinite(cellId) || cellId <= 0) {
      throw new Error('Invalid schedule cell id');
    }
    if (partial) {
      item.partialStartTime = span.from;
      item.partialEndTime = span.to;
    }
    return item;
  });
}

export type SubmitAttendanceInput =
  | {
      type: 'leave';
      mode: 'date_range';
      reason: string;
      leaveDateFrom: string;
      leaveDateTo: string;
    }
  | {
      type: 'leave';
      mode?: 'shift';
      reason: string;
      shifts: RequestShiftBinding[];
      /** 单段请假（兼容） */
      leaveTime?: LeaveTimeSpan;
      /** 多段/同日多班：key 为 `workDate|scheduleId` */
      leaveTimesByScheduleKey?: Record<string, LeaveTimeSpan>;
    }
  | {
      type: 'missed_punch';
      reason: string;
      workDate: string;
      shift: RequestShiftBinding;
      punchKind: 'in' | 'out';
      proposedTime: string;
    }
  | {
      type: 'missed_punch';
      source: 'field';
      reason: string;
      workDate: string;
      fieldJobId: string;
      punchKind: 'in' | 'out';
      proposedTime: string;
    };

export function buildAttendanceCreateBody(input: SubmitAttendanceInput): AppAttendanceRequestCreate {
  if (input.type === 'leave' && input.mode === 'date_range') {
    return {
      requestType: 'leave',
      leaveMode: 'date_range',
      leaveDateFrom: input.leaveDateFrom,
      leaveDateTo: input.leaveDateTo,
      reason: normalizeSubmitReason(input.reason),
    };
  }
  if (input.type === 'leave') {
    return {
      requestType: 'leave',
      leaveMode: 'shift',
      reason: normalizeSubmitReason(input.reason),
      leaveItems: buildLeaveItemsPayload(input.shifts, {
        leaveTime: input.leaveTime,
        leaveTimesByScheduleKey: input.leaveTimesByScheduleKey,
      }),
    };
  }
  if (input.type === 'missed_punch' && 'source' in input && input.source === 'field') {
    return {
      requestType: 'missed_punch',
      reason: normalizeSubmitReason(input.reason),
      fieldJobId: Number(input.fieldJobId),
      punchType: input.punchKind === 'out' ? 'clock_out' : 'clock_in',
      actualPunchedAt: toAttendanceDateTimeIso(input.workDate, input.proposedTime),
    };
  }
  if (input.type !== 'missed_punch') {
    throw new Error('Invalid attendance request input');
  }
  const shift = input.shift;
  const overnightPairCellId =
    shift.overnightPairCellId != null ? Number(shift.overnightPairCellId) : undefined;
  const overnightRole =
    shift.overnightRole === 'start' || shift.overnightRole === 'end'
      ? shift.overnightRole
      : undefined;
  return {
    requestType: 'missed_punch',
    reason: normalizeSubmitReason(input.reason),
    publishedCellId: Number(shift.scheduleId),
    punchType: input.punchKind === 'out' ? 'clock_out' : 'clock_in',
    actualPunchedAt: toAttendanceDateTimeIso(input.workDate, input.proposedTime),
    ...(overnightPairCellId != null && Number.isFinite(overnightPairCellId)
      ? { overnightPairCellId }
      : {}),
    ...(overnightRole ? { overnightRole } : {}),
  };
}
