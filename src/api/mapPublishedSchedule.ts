import type { AppEmployeeScheduleItem } from './types';

/** 排班页「我的排班」展示用的一条班次 */
export type MyPublishedShiftSlot = {
  id: string;
  areaName: string;
  shiftName: string;
  range: string;
  color?: string;
};

type RawScheduleItem = AppEmployeeScheduleItem & {
  dateStr?: string;
  date?: string;
};

function scheduleDateKey(item: RawScheduleItem): string {
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

function compareByStart(a: MyPublishedShiftSlot, b: MyPublishedShiftSlot): number {
  const ta = a.range.split('–')[0]?.trim() ?? '';
  const tb = b.range.split('–')[0]?.trim() ?? '';
  return ta.localeCompare(tb);
}

/** 将已发布排班列表按日期分组（key: yyyy-MM-dd） */
export function groupPublishedScheduleByDate(
  items: AppEmployeeScheduleItem[],
): Record<string, MyPublishedShiftSlot[]> {
  const byDate: Record<string, MyPublishedShiftSlot[]> = {};

  for (const item of items) {
    const dateKey = scheduleDateKey(item as RawScheduleItem);
    if (!dateKey) continue;

    const slot: MyPublishedShiftSlot = {
      id: String(item.id),
      areaName: item.areaName?.trim() || '—',
      shiftName: item.shiftName?.trim() || '—',
      range: formatShiftRange(item.startTime, item.endTime),
      color: item.color?.trim() || undefined,
    };

    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(slot);
  }

  for (const key of Object.keys(byDate)) {
    byDate[key].sort(compareByStart);
  }

  return byDate;
}
