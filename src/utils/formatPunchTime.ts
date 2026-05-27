/** 将 ISO 打卡时间格式化为界面展示的时:分 */
export function formatPunchHm(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const loc = language.startsWith('zh') ? 'zh-CN' : 'en-NZ';
  try {
    return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch {
    return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
  }
}

export function formatRequestDateTime(iso: string | undefined | null, language: string): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const loc = language.startsWith('zh') ? 'zh-CN' : 'en-NZ';
  try {
    return new Intl.DateTimeFormat(loc, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export { formatPunchHeaderDate } from './localeDateFormat';
