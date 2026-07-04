import type { LeaveRequest, User } from '../context/AuthContext';

export function isStoreManagerAt(user: User | undefined, storeId: string | undefined): boolean {
  if (!user || !storeId) return false;
  return user.storeManagerStoreIds.includes(storeId);
}

export function isDeputyManagerAt(user: User | undefined, storeId: string | undefined): boolean {
  if (!user || !storeId) return false;
  return user.deputyManagerStoreIds.includes(storeId);
}

/** 是否可管理当前门店（店长或副店长） */
export function isManagerRoleAtStore(user: User | undefined, storeId: string | undefined): boolean {
  return isStoreManagerAt(user, storeId) || isDeputyManagerAt(user, storeId);
}

export type StoreManagerHint = {
  /** 考勤列表等接口下发的「本店是否有店长」 */
  storeHasStoreManager?: boolean | null;
};

/** 当前门店是否已配置店长（优先接口字段，其次 storeDetails） */
export function doesStoreHaveStoreManager(
  user: User | undefined,
  storeId: string | undefined,
  hint?: StoreManagerHint,
): boolean {
  if (!user || !storeId) return false;
  if (hint?.storeHasStoreManager != null) return hint.storeHasStoreManager;
  const store = user.stores.find((s) => s.id === storeId);
  if (store?.hasStoreManager != null) return store.hasStoreManager;
  // 本人任店长 → 该店必有店长
  if (user.storeManagerStoreIds.includes(storeId)) return true;
  return false;
}

/** 待本人审批数量 */
export function countPendingApprovals(approvalRequests: LeaveRequest[]): number {
  return approvalRequests.filter((r) => r.status === 'pending').length;
}

/** 店长/副店长是否可审批该申请（本店、待审、非本人提交） */
export function canReviewAttendanceRequest(
  user: User | undefined,
  storeId: string | undefined,
  request: Pick<LeaveRequest, 'applicantId' | 'status' | 'storeId'>,
  applicantMerchantAdminId?: number | null,
): boolean {
  if (!user || !storeId || request.status !== 'pending') return false;
  const requestStoreId = request.storeId ?? storeId;
  if (requestStoreId !== storeId) return false;
  if (isRequestApplicant(user.id, request, applicantMerchantAdminId)) return false;
  return isManagerRoleAtStore(user, storeId);
}

/** 待审批数量（店长/副店长视角：本店他人 pending） */
export function countPendingApprovalsForManager(
  approvalRequests: LeaveRequest[],
  userId: string | undefined,
): number {
  if (!userId) return 0;
  return approvalRequests.filter(
    (r) => r.status === 'pending' && r.applicantId !== userId,
  ).length;
}

/** @deprecated 使用 canReviewAttendanceRequest */
export function isAssignedApprover(
  userId: string | undefined,
  request: Pick<LeaveRequest, 'approverId' | 'status'>,
): boolean {
  if (!userId || !request.approverId || request.status !== 'pending') return false;
  return request.approverId === userId;
}

/** 当前用户是否为该申请的提交人 */
export function isRequestApplicant(
  userId: string | undefined,
  request: Pick<LeaveRequest, 'applicantId'>,
  applicantMerchantAdminId?: number | null,
): boolean {
  if (!userId) return false;
  const applicantId =
    applicantMerchantAdminId != null
      ? String(applicantMerchantAdminId)
      : request.applicantId;
  return applicantId != null && applicantId === userId;
}

/**
 * 是否展示「审批记录 / 申请记录」分栏：店长或副店长始终分栏。
 */
export function shouldSplitRequestViews(
  user: User | undefined,
  storeId: string | undefined,
  _approvalRequests: LeaveRequest[],
  _hint?: StoreManagerHint,
): boolean {
  if (!user || !storeId) return false;
  return isManagerRoleAtStore(user, storeId);
}
