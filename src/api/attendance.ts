import { apiRequest } from './client';
import type {
  AppAttendanceFieldImpact,
  AppAttendanceRequest,
  AppAttendanceRequestCreate,
  AppAttendanceRequestList,
  AppAttendanceRequestReview,
  AppAttendanceLeaveItemRequest,
  MerchantAttendanceRequest,
} from './types';

export type AttendanceListQuery = {
  status?: 'pending' | 'approved' | 'rejected' | 'reviewed';
  from?: string;
  to?: string;
};

function buildQuery(params?: AttendanceListQuery): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** GET /api/v1/app/attendance/requests — 我的申请 */
export function fetchMyAttendanceRequests(
  storeId: string | number,
  query?: AttendanceListQuery,
) {
  return apiRequest<AppAttendanceRequestList>(`/api/v1/app/attendance/requests${buildQuery(query)}`, {
    storeId,
  });
}

/** GET /api/v1/app/attendance/requests/pending-approval — 待我审批 */
export function fetchPendingApprovalAttendanceRequests(
  storeId: string | number,
  query?: AttendanceListQuery,
) {
  return apiRequest<AppAttendanceRequestList>(
    `/api/v1/app/attendance/requests/pending-approval${buildQuery(query)}`,
    { storeId },
  );
}

/** GET /api/v1/app/attendance/requests/{id} — 申请详情 */
export function fetchAttendanceRequestDetail(storeId: string | number, requestId: string | number) {
  return apiRequest<MerchantAttendanceRequest>(`/api/v1/app/attendance/requests/${requestId}`, {
    storeId,
  });
}

/** POST /api/v1/app/attendance/requests/preview-leave-field-impacts — 提交前预览外勤影响 */
export type LeaveFieldImpactPreviewBody =
  | { leaveItems: AppAttendanceLeaveItemRequest[] }
  | { leaveDateFrom: string; leaveDateTo: string }
  | { fieldJobId: number };

export function previewLeaveFieldImpacts(
  storeId: string | number,
  body: LeaveFieldImpactPreviewBody,
) {
  return apiRequest<{ fieldImpacts?: AppAttendanceFieldImpact[] }>(
    '/api/v1/app/attendance/requests/preview-leave-field-impacts',
    {
      method: 'POST',
      storeId,
      body,
    },
  );
}

export function previewLeaveDutyImpacts(
  storeId: string | number,
  body: LeaveFieldImpactPreviewBody,
) {
  return apiRequest<{ dutyImpacts?: import('./types').AppAttendanceDutyImpact[] }>(
    '/api/v1/app/attendance/requests/preview-leave-duty-impacts',
    {
      method: 'POST',
      storeId,
      body,
    },
  );
}

/** POST /api/v1/app/attendance/requests */
export function createAttendanceRequest(
  storeId: string | number,
  body: AppAttendanceRequestCreate,
) {
  return apiRequest<AppAttendanceRequest>('/api/v1/app/attendance/requests', {
    method: 'POST',
    storeId,
    body,
  });
}

/** POST /api/v1/app/attendance/requests/{id}/cancel — 撤回（仅申请人、pending） */
export function cancelAttendanceRequest(
  storeId: string | number,
  requestId: string | number,
) {
  return apiRequest<MerchantAttendanceRequest>(
    `/api/v1/app/attendance/requests/${requestId}/cancel`,
    {
      method: 'POST',
      storeId,
    },
  );
}

export type SubstituteCandidate = {
  id: number | string;
  name: string;
};

/** GET /api/v1/app/attendance/substitute-candidates — 当前门店、替班时段内无已发布排班的员工 */
export function fetchSubstituteCandidates(
  storeId: string | number,
  params: {
    leaveItemId?: string | number;
    scheduleDate?: string;
    startTime?: string;
    endTime?: string;
    excludeMerchantAdminId?: string | number;
  },
) {
  const q = new URLSearchParams();
  if (params.leaveItemId != null) q.set('leaveItemId', String(params.leaveItemId));
  if (params.scheduleDate) q.set('scheduleDate', params.scheduleDate);
  if (params.startTime) q.set('startTime', params.startTime);
  if (params.endTime) q.set('endTime', params.endTime);
  if (params.excludeMerchantAdminId != null) {
    q.set('excludeMerchantAdminId', String(params.excludeMerchantAdminId));
  }
  const qs = q.toString();
  return apiRequest<{ storeId?: number | string; items?: Array<{ id?: number | string; name?: string }> }>(
    `/api/v1/app/attendance/substitute-candidates${qs ? `?${qs}` : ''}`,
    { storeId },
  ).then((data) => {
    const items = data?.items ?? [];
    return items
      .map((row) => ({
        id: row.id as number | string,
        name: (row.name ?? '').trim() || String(row.id ?? ''),
      }))
      .filter((row) => row.id != null && row.id !== '') as SubstituteCandidate[];
  });
}

/** POST /api/v1/app/attendance/requests/{id}/review */
export function reviewAttendanceRequest(
  storeId: string | number,
  requestId: string | number,
  body: AppAttendanceRequestReview,
) {
  return apiRequest<AppAttendanceRequest>(
    `/api/v1/app/attendance/requests/${requestId}/review`,
    {
      method: 'POST',
      storeId,
      body,
    },
  );
}
