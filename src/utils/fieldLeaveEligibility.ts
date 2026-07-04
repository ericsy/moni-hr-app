import type { LeaveRequest } from '../context/AuthContext';
import type { TimelineFieldJobItem } from '../types/fieldService';

function normalizeFieldJobId(value?: string | null): string {
  return String(value ?? '').trim();
}

function isOpenLeaveStatus(status: LeaveRequest['status']): boolean {
  return status === 'pending' || status === 'approved';
}

export function isFieldLeaveRequest(row: LeaveRequest): boolean {
  if (row.type !== 'leave') return false;
  if (row.leaveMode === 'field_job') return true;
  return normalizeFieldJobId(row.fieldJob?.id) !== '';
}

function fieldLeaveMatchesJob(row: LeaveRequest, fieldJobId: string): boolean {
  const targetId = normalizeFieldJobId(fieldJobId);
  if (!targetId) return false;
  return normalizeFieldJobId(row.fieldJob?.id) === targetId;
}

/** 店班/按日期请假的 fieldImpacts 是否包含此外勤（有实际重叠） */
function leaveImpactCoversFieldJob(
  row: LeaveRequest,
  fieldJobId: string,
): boolean {
  const targetId = normalizeFieldJobId(fieldJobId);
  if (!targetId) return false;
  return (row.fieldImpacts ?? []).some((impact) => {
    if (normalizeFieldJobId(String(impact.fieldJobId ?? '')) !== targetId) return false;
    const overlap = (impact.overlapType ?? '').trim().toLowerCase();
    if (overlap === 'full' || overlap === 'partial') return true;
    return (impact.requiredAction ?? '').trim().toLowerCase() === 'required';
  });
}

/** 待审批的外勤请假（已撤回/已驳回的不占用） */
export function findOpenFieldLeaveRequest(
  requests: LeaveRequest[],
  fieldJobId: string,
): LeaveRequest | undefined {
  return requests.find(
    (row) =>
      isFieldLeaveRequest(row) &&
      row.status === 'pending' &&
      fieldLeaveMatchesJob(row, fieldJobId),
  );
}

/**
 * 此外勤已被待审批/已通过请假占用：
 * - 独立外勤请假
 * - 店班/按日期请假的 fieldImpacts 已包含此外勤
 */
export function findLeaveCoveringFieldJob(
  requests: LeaveRequest[],
  fieldJobId: string,
): LeaveRequest | undefined {
  const jobId = normalizeFieldJobId(fieldJobId);
  if (!jobId) return undefined;
  return requests.find((row) => {
    if (row.type !== 'leave' || !isOpenLeaveStatus(row.status)) return false;
    if (isFieldLeaveRequest(row) && fieldLeaveMatchesJob(row, jobId)) return true;
    return leaveImpactCoversFieldJob(row, jobId);
  });
}

/** 请假待审批且覆盖此外勤（排班展示「请假待审批」） */
export function findPendingLeaveCoveringFieldJob(
  requests: LeaveRequest[],
  fieldJobId: string,
): LeaveRequest | undefined {
  const jobId = normalizeFieldJobId(fieldJobId);
  if (!jobId) return undefined;
  return requests.find((row) => {
    if (row.type !== 'leave' || row.status !== 'pending') return false;
    if (isFieldLeaveRequest(row) && fieldLeaveMatchesJob(row, jobId)) return true;
    return leaveImpactCoversFieldJob(row, jobId);
  });
}

/** 请假已审批通过且覆盖此外勤（排班展示「请假已通过」） */
export function findApprovedLeaveCoveringFieldJob(
  requests: LeaveRequest[],
  fieldJobId: string,
): LeaveRequest | undefined {
  const jobId = normalizeFieldJobId(fieldJobId);
  if (!jobId) return undefined;
  return requests.find((row) => {
    if (row.type !== 'leave' || row.status !== 'approved') return false;
    if (isFieldLeaveRequest(row) && fieldLeaveMatchesJob(row, jobId)) return true;
    return leaveImpactCoversFieldJob(row, jobId);
  });
}

/** 外勤是否因请假已通过而不再出勤（后端 leaveApproved 或本地申请记录） */
export function isFieldJobLeaveApproved(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
): boolean {
  if (job.leaveApproved) return true;
  return !!findApprovedLeaveCoveringFieldJob(requests, job.id);
}

/** 外勤工单是否可申请独立请假（未被其它请假占用；含已过去日期的外勤） */
export function canApplyFieldLeave(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[] = [],
): boolean {
  const jobId = normalizeFieldJobId(job.id);
  if (!jobId) return false;
  if (job.leaveApproved) return false;
  return !findLeaveCoveringFieldJob(requests, jobId);
}
