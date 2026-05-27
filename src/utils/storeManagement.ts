import type { StoreBrief } from '../api/types';
import type { User } from '../context/AuthContext';

export function storeBriefsToIds(stores?: StoreBrief[] | null): string[] {
  return (stores ?? []).map((s) => String(s.id));
}

/** 当前选中门店是否为该员工担任店长或副店长的门店（登录/me 的 storeManagerStores + deputyManagerStores） */
export function canViewStoreRoster(
  user: User | undefined,
  selectedStoreId: string | undefined,
): boolean {
  if (!user || !selectedStoreId) return false;
  return user.managedStoreIds.includes(selectedStoreId);
}
