import type { User } from '../context/AuthContext';
import type { AppEmployeeUser, StoreBrief } from './types';
import { mapApiRoleToUserRole, pickRoleTitlesFromRoleField } from '../utils/userRoleDisplay';
import { storeBriefsToIds } from '../utils/storeManagement';

/** 后端可能返回 camelCase 或 snake_case */
type RawAppEmployee = AppEmployeeUser & {
  store_manager_stores?: StoreBrief[];
  deputy_manager_stores?: StoreBrief[];
};

function normalizeAppEmployee(emp: AppEmployeeUser): AppEmployeeUser {
  const r = emp as RawAppEmployee;
  return {
    ...emp,
    storeManagerStores: emp.storeManagerStores ?? r.store_manager_stores ?? [],
    deputyManagerStores: emp.deputyManagerStores ?? r.deputy_manager_stores ?? [],
  };
}

export function mapEmployeeToUser(emp: AppEmployeeUser): User {
  const e = normalizeAppEmployee(emp);

  const fromDetails = (e.storeDetails ?? []).map((s) => {
    const raw = s as StoreBrief & { has_store_manager?: boolean };
    const hasStoreManager = raw.hasStoreManager ?? raw.has_store_manager;
    return {
      id: String(s.id),
      name: s.name,
      ...(hasStoreManager != null ? { hasStoreManager } : {}),
    };
  });
  const fromIds =
    e.storeIds?.map((id) => ({
      id: String(id),
      name: `Store ${id}`,
    })) ?? [];
  const stores = fromDetails.length > 0 ? fromDetails : fromIds;

  const lastId = e.lastStoreId != null ? String(e.lastStoreId) : '';
  const selectedStoreId =
    lastId && stores.some((s) => s.id === lastId) ? lastId : (stores[0]?.id ?? '');

  const managerIds = storeBriefsToIds(e.storeManagerStores);
  const deputyIds = storeBriefsToIds(e.deputyManagerStores);
  const managedStoreIds = [...new Set([...managerIds, ...deputyIds])];

  const displayName =
    e.name?.trim() ||
    [e.firstName, e.lastName].filter(Boolean).join(' ').trim() ||
    e.email;

  const fromRole = pickRoleTitlesFromRoleField(e.role ?? null);

  return {
    id: String(e.id),
    name: displayName,
    employeeId: e.employeeCode?.trim() || String(e.id),
    role: mapApiRoleToUserRole(e),
    roleTitleZh: fromRole.zh,
    roleTitleEn: fromRole.en,
    managedStoreIds,
    storeManagerStoreIds: managerIds,
    deputyManagerStoreIds: deputyIds,
    activated: true,
    email: e.email,
    phone: e.phone?.trim() ?? '',
    stores,
    selectedStoreId,
  };
}
