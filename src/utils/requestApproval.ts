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

/** 副店长作为审批人是否有待审批或已处理记录 */
export function hasDeputyApprovalRecords(approvalRequests: LeaveRequest[]): boolean {
  return approvalRequests.some(
    (r) => r.status === 'pending' || r.status === 'approved' || r.status === 'rejected',
  );
}

/**
 * 是否展示「审批记录 / 申请记录」分栏：
 * - 店长：始终分栏
 * - 副店长：本店无店长 → 始终分栏；本店有店长 → 仅当存在待审批或已审批记录时分栏
 */
export function shouldSplitRequestViews(
  user: User | undefined,
  storeId: string | undefined,
  approvalRequests: LeaveRequest[],
  hint?: StoreManagerHint,
): boolean {
  if (!user || !storeId) return false;
  if (isStoreManagerAt(user, storeId)) return true;
  if (!isDeputyManagerAt(user, storeId)) return false;

  const storeHasManager = doesStoreHaveStoreManager(user, storeId, hint);
  if (!storeHasManager) return true;

  return hasDeputyApprovalRecords(approvalRequests);
}
