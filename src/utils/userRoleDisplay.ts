import type { User, UserRole } from '../context/AuthContext';
import type { AppEmployeeRole, AppEmployeeUser } from '../api/types';

function trim(s: string | null | undefined): string {
  return (s ?? '').trim();
}

/** 从接口 `role` 解析中英文职位文案 */
export function pickRoleTitlesFromRoleField(role: AppEmployeeRole | null | undefined): {
  zh?: string;
  en?: string;
} {
  if (role == null) return {};
  const zh = trim(role.nameZh);
  const en = trim(role.nameEn);
  if (zh || en) {
    const out: { zh?: string; en?: string } = {};
    if (zh) out.zh = zh;
    if (en) out.en = en;
    return out;
  }
  return {};
}

/** 按当前 App 语言取接口下发的职位文案；缺失时回退另一语言 */
export function getUserRoleTitle(user: User, lang: 'en' | 'zh'): string {
  const zh = trim(user.roleTitleZh);
  const en = trim(user.roleTitleEn);
  if (lang === 'zh') {
    return zh || en;
  }
  return en || zh;
}

function jobRoleCodeToUserRole(code: string | null | undefined): UserRole | undefined {
  const c = trim(code).toLowerCase();
  if (!c) return undefined;
  if (
    c === 'manager' ||
    c === 'store_manager' ||
    c === 'shop_manager' ||
    c === 'supervisor' ||
    c === 'assistant_manager' ||
    c === 'team_lead'
  ) {
    return 'manager';
  }
  return 'staff';
}

/** 档案职位（非门店任职）；店铺排班权限见 managedStoreIds */
export function mapApiRoleToUserRole(emp: AppEmployeeUser): UserRole {
  return jobRoleCodeToUserRole(emp.role?.code) ?? 'staff';
}
