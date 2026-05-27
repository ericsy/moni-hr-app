import i18n from '../i18n';

export type AppLanguage = 'en' | 'zh';

export function normalizeAppLanguage(language?: string | null): AppLanguage {
  const lng = (language ?? i18n.language ?? 'en').toLowerCase();
  return lng.startsWith('zh') ? 'zh' : 'en';
}

function tList(key: string, lng: AppLanguage): string[] {
  return i18n
    .t(key, { lng })
    .split(',')
    .map((s) => s.trim());
}

function weekdayAbbr(date: Date, lng: AppLanguage): string {
  const list = tList('weekdayAbbrList', lng);
  const idx = (date.getDay() + 6) % 7;
  return list[idx] ?? '';
}

function monthShort(monthIndex: number, lng: AppLanguage): string {
  const list = tList('monthNamesShort', lng);
  return list[monthIndex] ?? String(monthIndex + 1);
}

function monthLong(monthIndex: number, lng: AppLanguage): string {
  const list = tList('monthNamesLong', lng);
  return list[monthIndex] ?? String(monthIndex + 1);
}

/** 排班页选中日期行、打卡记录页日期行 */
export function formatPunchHeaderDate(isoDate: string, language?: string | null): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  const lng = normalizeAppLanguage(language);
  const wd = weekdayAbbr(date, lng);
  if (lng === 'zh') {
    return `${y}年${m}月${d}日 ${wd}`;
  }
  return `${wd}, ${d} ${monthShort(m - 1, lng)} ${y}`;
}

export function formatSelectedHeaderLine(d: Date, language?: string | null): string {
  return formatPunchHeaderDate(
    `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`,
    language,
  );
}

export function weekNavigatorLabels(
  weekStart: Date,
  language?: string | null,
): { rangeLine: string; metaLine: string } {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const lng = normalizeAppLanguage(language);
  const rangeLine = `${weekStart.getDate()} – ${end.getDate()}`;

  const sameMonth =
    weekStart.getMonth() === end.getMonth() && weekStart.getFullYear() === end.getFullYear();

  let metaLine: string;
  if (sameMonth) {
    const y = weekStart.getFullYear();
    const m = weekStart.getMonth();
    metaLine = lng === 'zh' ? `${y}年${m + 1}月` : `${monthLong(m, lng)} ${y}`;
  } else if (lng === 'zh') {
    metaLine = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日 ${end.getFullYear()}年`;
  } else {
    metaLine = `${monthShort(weekStart.getMonth(), lng)} ${weekStart.getDate()} – ${monthShort(end.getMonth(), lng)} ${end.getDate()}, ${end.getFullYear()}`;
  }

  return { rangeLine, metaLine };
}
