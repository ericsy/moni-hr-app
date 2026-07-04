import type { TFunction } from 'i18next';

import type { AppAttendanceFieldImpact } from '../api/types';
import { calendarDateKey } from './calendarDateKey';
import { formatFieldServiceType, formatFieldSyncConfig } from './fieldServiceType';
import { formatPunchHeaderDate, formatPunchHm } from './formatPunchTime';

function extractDateKey(value?: string | null): string | undefined {
  const s = (value ?? '').trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return calendarDateKey(new Date(ms));
  return undefined;
}

function extractHm(value: string | undefined, language: string): string | undefined {
  const s = (value ?? '').trim();
  if (!s) return undefined;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatPunchHm(s, language);
  const match = /T(\d{1,2}):(\d{2})/.exec(s);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return undefined;
}

export function formatFieldOverlapType(
  overlapType: string | undefined | null,
  t: TFunction,
): string | undefined {
  const raw = (overlapType ?? '').trim().toLowerCase();
  if (!raw || raw === 'none') return undefined;
  if (raw === 'full') return t('leaveFieldOverlapFull');
  if (raw === 'partial') return t('leaveFieldOverlapPartial');
  return undefined;
}

export type FieldImpactDisplay = {
  title: string;
  dateLabel: string;
  rangeLabel: string;
  overlapLabel?: string;
  serviceTypeLabel?: string;
  syncLabel?: string;
  required: boolean;
};

export function parseFieldImpactScheduleWindow(
  impact: AppAttendanceFieldImpact,
  language: string,
): { scheduleDate?: string; startTime?: string; endTime?: string } {
  const scheduleDate =
    extractDateKey(impact.scheduledStart) ?? extractDateKey(impact.scheduledEnd);
  return {
    scheduleDate,
    startTime: extractHm(impact.scheduledStart, language),
    endTime: extractHm(impact.scheduledEnd, language),
  };
}

export function buildFieldImpactDisplay(
  impact: AppAttendanceFieldImpact,
  t: TFunction,
  language: string,
): FieldImpactDisplay {
  const title = (impact.customerName ?? '').trim() || t('todayTimelineFieldJob');
  const dateKey =
    extractDateKey(impact.scheduledStart) ?? extractDateKey(impact.scheduledEnd) ?? '';
  const startHm = extractHm(impact.scheduledStart, language);
  const endHm = extractHm(impact.scheduledEnd, language);
  const rangeLabel =
    startHm && endHm ? `${startHm}–${endHm}` : startHm || endHm || '—';
  const dateLabel = dateKey ? formatPunchHeaderDate(dateKey, language) : '—';
  const serviceTypeLabel = formatFieldServiceType(impact.serviceType, t) || undefined;
  const syncLabel = formatFieldSyncConfig(impact, t) || undefined;

  return {
    title,
    dateLabel,
    rangeLabel,
    overlapLabel: formatFieldOverlapType(impact.overlapType, t),
    serviceTypeLabel,
    syncLabel: syncLabel === t('fieldJobSyncNone') ? undefined : syncLabel,
    required: impact.requiredAction === 'required',
  };
}

export function formatFieldImpactAlertLine(
  impact: AppAttendanceFieldImpact,
  t: TFunction,
  language: string,
): string {
  const row = buildFieldImpactDisplay(impact, t, language);
  const parts = [`• ${row.title}`, `  ${row.dateLabel} ${row.rangeLabel}`];
  const tail: string[] = [];
  if (row.overlapLabel) tail.push(row.overlapLabel);
  if (row.required) tail.push(t('leaveFieldImpactRequired'));
  if (tail.length > 0) parts.push(`  ${tail.join(' · ')}`);
  return parts.join('\n');
}
