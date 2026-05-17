/** 本地日历 YYYY-MM-DD（勿用 toISOString，避免 UTC 跨日错位） */
export function calendarDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
