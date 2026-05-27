import { apiRequest } from './client';
import type {
  AppAttendanceRequest,
  AppAttendanceRequestCreate,
  AppAttendanceRequestList,
  AppAttendanceRequestReview,
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
