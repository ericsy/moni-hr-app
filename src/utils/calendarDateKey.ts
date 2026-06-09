/** 本地日历 YYYY-MM-DD（勿用 toISOString，避免 UTC 跨日错位） */
export function calendarDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 路由参数 / API 日期归一化；无效时返回空串 */
export function normalizeDateKey(value?: string | string[] | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const s = (raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** 归一化日期；无效时回退为今天（本地日历） */
export function normalizeDateKeyOrToday(
  value?: string | string[] | null,
  now: Date = new Date(),
): string {
  return normalizeDateKey(value) || calendarDateKey(now);
}
