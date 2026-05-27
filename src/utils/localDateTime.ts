import { calendarDateKey } from './calendarDateKey';

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeekMondayLocal(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysLocal(d, diff);
}

export function parseHm(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute };
}

export function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 从排班时段 "08:30–12:30" 取上班或下班时刻（HH:mm） */
export function compareHm(a: string, b: string): number {
  const pa = parseHm(a);
  const pb = parseHm(b);
  return pa.hour * 60 + pa.minute - (pb.hour * 60 + pb.minute);
}

/** 解析排班时段为 HH:mm 起止 */
export function parseScheduledHmRange(range: string): { start: string; end: string } | null {
  const parts = range.split(/[–-]/).map((s) => s.trim());
  if (parts.length < 2) return null;
  return { start: hmFromShiftRange(range, 'start'), end: hmFromShiftRange(range, 'end') };
}

/** 部分时段默认：与班次计划起止一致 */
export function defaultPartialFromShiftRange(range: string): { from: string; to: string } | null {
  const bounds = parseScheduledHmRange(range);
  if (!bounds) return null;
  return { from: bounds.start, to: bounds.end };
}

export function hmFromShiftRange(range: string, kind: 'start' | 'end'): string {
  const parts = range.split(/[–-]/).map((s) => s.trim());
  const raw = kind === 'end' ? (parts[1] ?? parts[0]) : (parts[0] ?? '09:00');
  const { hour, minute } = parseHm(raw ?? '09:00');
  return formatHm(hour, minute);
}

export function dateFromHm(hm: string): Date {
  const { hour, minute } = parseHm(hm);
  return new Date(2000, 0, 1, hour, minute, 0, 0);
}

export function hmFromDate(d: Date): string {
  return formatHm(d.getHours(), d.getMinutes());
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

/** 请假结束日期不得早于开始日期 */
export function clampEndDateKey(startKey: string, endKey: string): string {
  return compareDateKeys(endKey, startKey) < 0 ? startKey : endKey;
}
