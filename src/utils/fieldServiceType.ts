import type { TFunction } from 'i18next';

/** 外勤服务类型 code → 当前语言展示名（与商家端 serviceTypes 对齐） */
export function formatFieldServiceType(value: string | undefined | null, t: TFunction): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  const types = t('fieldServiceTypes', { returnObjects: true });
  if (types && typeof types === 'object' && !Array.isArray(types)) {
    const label = (types as Record<string, string>)[key];
    if (label) return label;
  }
  return raw;
}

export function formatFieldSyncConfig(
  job: { syncStoreClockIn?: boolean | null; syncStoreClockOut?: boolean | null },
  t: TFunction,
): string {
  const parts: string[] = [];
  if (job.syncStoreClockIn) parts.push(t('fieldJobSyncClockIn'));
  if (job.syncStoreClockOut) parts.push(t('fieldJobSyncClockOut'));
  if (!parts.length) return t('fieldJobSyncNone');
  return parts.join('、');
}
