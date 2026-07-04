import type { AppStoreFieldJobItem } from '../api/types';

export type StoreDayFieldJob = {
  id: string;
  startTime: string;
  endTime: string;
  range: string;
  customerName: string;
  serviceAddress: string;
  serviceType?: string;
  status?: string;
  syncStoreClockIn: boolean;
  syncStoreClockOut: boolean;
  linkedStoreShiftId?: string;
  assignees: { id: string; name: string }[];
};

function formatFieldJobRange(startTime?: string, endTime?: string): string {
  const start = (startTime ?? '').trim();
  const end = (endTime ?? '').trim();
  if (start && end) return `${start}–${end}`;
  return start || end || '—';
}

function scheduleDateKey(item: AppStoreFieldJobItem): string {
  const raw = item.date_str ?? '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export function groupStoreFieldJobsByDate(
  items: AppStoreFieldJobItem[],
): Record<string, StoreDayFieldJob[]> {
  const byDate: Record<string, StoreDayFieldJob[]> = {};

  for (const item of items) {
    const dateKey = scheduleDateKey(item);
    if (!dateKey) continue;

    const job: StoreDayFieldJob = {
      id: String(item.id),
      startTime: (item.startTime ?? '').trim(),
      endTime: (item.endTime ?? '').trim(),
      range: formatFieldJobRange(item.startTime, item.endTime),
      customerName: item.customerName?.trim() || '—',
      serviceAddress: item.serviceAddress?.trim() || '',
      serviceType: item.serviceType?.trim() || undefined,
      status: item.status?.trim() || undefined,
      syncStoreClockIn: item.syncStoreClockIn === true,
      syncStoreClockOut: item.syncStoreClockOut === true,
      linkedStoreShiftId:
        item.linkedStoreShiftId != null ? String(item.linkedStoreShiftId) : undefined,
      assignees: (item.assignees ?? [])
        .map((a) => ({
          id: String(a.id),
          name: a.name?.trim() || '—',
        }))
        .filter((a) => a.name !== '—' || a.id),
    };

    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(job);
  }

  for (const jobs of Object.values(byDate)) {
    jobs.sort((a, b) => compareHmRange(a.startTime, a.endTime, b.startTime, b.endTime));
  }
  return byDate;
}

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function compareHmRange(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const a = parseHm(aStart) ?? 0;
  const b = parseHm(bStart) ?? 0;
  if (a !== b) return a - b;
  return (parseHm(aEnd) ?? 0) - (parseHm(bEnd) ?? 0);
}

export function storeDayHasFieldJobs(jobs: StoreDayFieldJob[] | undefined): boolean {
  return (jobs?.length ?? 0) > 0;
}
