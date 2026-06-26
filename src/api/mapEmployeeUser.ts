import type { User } from '../context/AuthContext';
import type { AppEmployeeUser, StoreBrief } from './types';
import { mapApiRoleToUserRole, pickRoleTitlesFromRoleField } from '../utils/userRoleDisplay';
import { storeBriefsToIds } from '../utils/storeManagement';

/** 后端可能返回 camelCase 或 snake_case */
type RawAppEmployee = AppEmployeeUser & {
  store_manager_stores?: StoreBrief[];
  deputy_manager_stores?: StoreBrief[];
};

type RawStoreBrief = StoreBrief & {
  merchant_id?: number;
  merchant_name?: string;
};

function normalizeAppEmployee(emp: AppEmployeeUser): AppEmployeeUser {
  const r = emp as RawAppEmployee;
  return {
    ...emp,
    storeManagerStores: emp.storeManagerStores ?? r.store_manager_stores ?? [],
    deputyManagerStores: emp.deputyManagerStores ?? r.deputy_manager_stores ?? [],
  };
}

function mapStoreBrief(s: StoreBrief): {
  id: string;
  name: string;
  merchantId?: string;
  merchantName?: string;
  hasStoreManager?: boolean;
} {
  const raw = s as RawStoreBrief;
  const merchantId = raw.merchantId ?? raw.merchant_id;
  const merchantName = raw.merchantName ?? raw.merchant_name;
  const hasStoreManager = raw.hasStoreManager ?? raw.has_store_manager;
  const label =
    merchantName && merchantName.trim()
      ? `${merchantName.trim()} / ${s.name}`
      : s.name;
  return {
    id: String(s.id),
    name: label,
    ...(merchantId != null ? { merchantId: String(merchantId) } : {}),
    ...(merchantName ? { merchantName } : {}),
    ...(hasStoreManager != null ? { hasStoreManager } : {}),
  };
}

export function mapEmployeeToUser(emp: AppEmployeeUser): User {
  const e = normalizeAppEmployee(emp);

  const fromDetails = (e.storeDetails ?? []).map((s) => mapStoreBrief(s));
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
