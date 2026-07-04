import type { AppStoreScheduleItem } from './types';

export type StoreRosterStatus = 'normal' | 'substitution' | 'on_leave';

export type StoreRosterStaffEntry = {
  id: string;
  name: string;
  rosterStatus: StoreRosterStatus;
};

/** 店铺排班日视图：区域 → 班次 → 员工 */
export type StoreDayShiftGroup = {
  shiftName: string;
  range: string;
  isSubstitution: boolean;
  originalDisplayName?: string;
  staff: StoreRosterStaffEntry[];
  /** 聚合后的已发布排班格 id（用于外勤嵌套关联） */
  cellIds: string[];
};

export type StoreDayRegionGroup = {
  areaName: string;
  shifts: StoreDayShiftGroup[];
};

type RawStoreItem = AppStoreScheduleItem & {
  dateStr?: string;
  date?: string;
};

function scheduleDateKey(item: RawStoreItem): string {
  const raw = item.date_str ?? item.dateStr ?? item.date ?? '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return s;
}

function formatShiftRange(startTime?: string, endTime?: string): string {
  const start = (startTime ?? '').trim();
  const end = (endTime ?? '').trim();
  if (start && end) return `${start}–${end}`;
  return start || end;
}

function shiftGroupKey(shiftName: string, range: string, isSubstitution: boolean): string {
  return `${isSubstitution ? 'sub' : 'normal'}\0${shiftName}\0${range}`;
}

function normalizeRosterStatus(raw?: string | null): StoreRosterStatus {
  if (raw === 'substitution' || raw === 'on_leave') return raw;
  return 'normal';
}

function mergeStaff(
  existing: StoreRosterStaffEntry[],
  incoming: StoreRosterStaffEntry[],
): StoreRosterStaffEntry[] {
  const byId = new Map<string, StoreRosterStaffEntry>();
  for (const entry of [...existing, ...incoming]) {
    const prev = byId.get(entry.id);
    if (!prev) {
      byId.set(entry.id, entry);
      continue;
    }
    const rank = (s: StoreRosterStatus) => (s === 'substitution' ? 2 : s === 'on_leave' ? 1 : 0);
    if (rank(entry.rosterStatus) > rank(prev.rosterStatus)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** 将整店已发布排班按日期分组；替班与普通班次分开展示 */
export function groupStorePublishedScheduleByDate(
  items: AppStoreScheduleItem[],
): Record<string, StoreDayRegionGroup[]> {
  const byDate: Record<string, Map<string, Map<string, StoreDayShiftGroup>>> = {};

  for (const item of items) {
    const dateKey = scheduleDateKey(item as RawStoreItem);
    if (!dateKey) continue;

    const areaName = item.areaName?.trim() || '—';
    const shiftName = item.shiftName?.trim() || '—';
    const range = formatShiftRange(item.startTime, item.endTime);
    const isSubstitution = item.isSubstitution === true;
    const originalDisplayName = item.originalDisplayName?.trim() || undefined;
    const staff: StoreRosterStaffEntry[] = (item.employees ?? [])
      .map((e) => ({
        id: String(e.id),
        name: e.name?.trim() || '—',
        rosterStatus: normalizeRosterStatus(e.rosterStatus),
      }))
      .filter((e) => e.name !== '—' || e.id);

    if (!byDate[dateKey]) byDate[dateKey] = new Map();
    const byArea = byDate[dateKey];
    if (!byArea.has(areaName)) byArea.set(areaName, new Map());
    const byShift = byArea.get(areaName)!;
    const key = shiftGroupKey(shiftName, range, isSubstitution);
    const cellId = String(item.id);
    const existing = byShift.get(key);
    if (existing) {
      existing.staff = mergeStaff(existing.staff, staff);
      if (!existing.cellIds.includes(cellId)) {
        existing.cellIds.push(cellId);
      }
      if (!existing.originalDisplayName && originalDisplayName) {
        existing.originalDisplayName = originalDisplayName;
      }
    } else {
      byShift.set(key, {
        shiftName,
        range,
        isSubstitution,
        originalDisplayName,
        staff,
        cellIds: [cellId],
      });
    }
  }

  const out: Record<string, StoreDayRegionGroup[]> = {};
  for (const [dateKey, byArea] of Object.entries(byDate)) {
    const regions: StoreDayRegionGroup[] = [];
    for (const [areaName, byShift] of byArea) {
      const shifts = [...byShift.values()].sort((a, b) => {
        if (a.isSubstitution !== b.isSubstitution) {
          return a.isSubstitution ? 1 : -1;
        }
        return a.range.localeCompare(b.range, undefined, { numeric: true });
      });
      if (shifts.length > 0) {
        regions.push({ areaName, shifts });
      }
    }
    regions.sort((a, b) => a.areaName.localeCompare(b.areaName));
    out[dateKey] = regions;
  }
  return out;
}

export function storeDayHasRoster(entries: StoreDayRegionGroup[] | undefined): boolean {
  return (entries ?? []).some((rg) => rg.shifts.some((sh) => sh.staff.length > 0));
}
