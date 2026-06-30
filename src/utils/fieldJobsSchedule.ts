import { fetchTodayWorkSummary } from '../api/todayWork';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type {
  TimelineFieldJobItem,
  TimelineStoreShiftItem,
  TodayWorkSummary,
  TodayWorkTimelineItem,
} from '../types/fieldService';

export function extractFieldJobs(timeline: TodayWorkTimelineItem[]): TimelineFieldJobItem[] {
  return timeline.filter((item): item is TimelineFieldJobItem => item.type === 'field_job');
}

function jobKey(job: TimelineFieldJobItem): string {
  return job.id || `${job.start}|${job.end}|${job.customerName}`;
}

/** 按时间线顺序，将外勤工单挂到 preceding 门店班次 id 下 */
export function groupFieldJobsByShiftId(timeline: TodayWorkTimelineItem[]): {
  byShiftId: Record<string, TimelineFieldJobItem[]>;
  standalone: TimelineFieldJobItem[];
} {
  const byShiftId: Record<string, TimelineFieldJobItem[]> = {};
  const standalone: TimelineFieldJobItem[] = [];
  let currentShiftId: string | null = null;

  for (const item of timeline) {
    if (item.type === 'store_shift') {
      currentShiftId = item.id;
      if (!byShiftId[currentShiftId]) byShiftId[currentShiftId] = [];
      continue;
    }
    if (currentShiftId) {
      if (!byShiftId[currentShiftId]) byShiftId[currentShiftId] = [];
      byShiftId[currentShiftId].push(item);
    } else {
      standalone.push(item);
    }
  }

  return { byShiftId, standalone };
}

/** 将外勤工单对齐到排班表班次（处理 id 不一致、加载顺序等问题） */
export function resolveFieldJobsForSchedule(
  shifts: MyPublishedShiftSlot[],
  timeline: TodayWorkTimelineItem[],
): {
  fieldJobsByShiftId: Record<string, TimelineFieldJobItem[]>;
  standaloneFieldJobs: TimelineFieldJobItem[];
  allFieldJobs: TimelineFieldJobItem[];
} {
  const { byShiftId, standalone } = groupFieldJobsByShiftId(timeline);
  const allFieldJobs = extractFieldJobs(timeline);
  const shiftIdSet = new Set(shifts.map((s) => s.id));
  const fieldJobsByShiftId: Record<string, TimelineFieldJobItem[]> = {};
  const standaloneFieldJobs: TimelineFieldJobItem[] = [...standalone];
  const assigned = new Set<string>();

  const markAssigned = (jobs: TimelineFieldJobItem[]) => {
    for (const job of jobs) assigned.add(jobKey(job));
  };

  for (const [shiftId, jobs] of Object.entries(byShiftId)) {
    if (shiftIdSet.has(shiftId)) {
      fieldJobsByShiftId[shiftId] = jobs;
      markAssigned(jobs);
    }
  }

  const timelineShifts = timeline.filter(
    (item): item is TimelineStoreShiftItem => item.type === 'store_shift',
  );
  for (let i = 0; i < shifts.length; i++) {
    const slot = shifts[i];
    if ((fieldJobsByShiftId[slot.id]?.length ?? 0) > 0) continue;
    const timelineShift = timelineShifts[i];
    if (!timelineShift) continue;
    const jobs = byShiftId[timelineShift.id];
    if (!jobs?.length) continue;
    fieldJobsByShiftId[slot.id] = jobs;
    markAssigned(jobs);
  }

  for (const job of allFieldJobs) {
    const key = jobKey(job);
    if (!assigned.has(key)) {
      standaloneFieldJobs.push(job);
      assigned.add(key);
    }
  }

  return { fieldJobsByShiftId, standaloneFieldJobs, allFieldJobs };
}

export async function fetchWorkSummariesByDates(
  storeId: string | number,
  dates: string[],
): Promise<Record<string, TodayWorkSummary>> {
  const unique = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (!storeId || unique.length === 0) return {};

  const entries = await Promise.all(
    unique.map(async (date) => {
      try {
        const summary = await fetchTodayWorkSummary({ storeId, date });
        return [date, summary] as const;
      } catch {
        return [
          date,
          {
            date,
            timeline: [],
            dayStatus: 'not_started' as const,
            currentPunchAction: { action: 'WAITING' },
          },
        ] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

export async function fetchWorkTimelinesByDates(
  storeId: string | number,
  dates: string[],
): Promise<Record<string, TodayWorkTimelineItem[]>> {
  const summaries = await fetchWorkSummariesByDates(storeId, dates);
  const timelines: Record<string, TodayWorkTimelineItem[]> = {};
  for (const [date, summary] of Object.entries(summaries)) {
    timelines[date] = summary.timeline;
  }
  return timelines;
}

export async function fetchFieldJobsByDates(
  storeId: string | number,
  dates: string[],
): Promise<Record<string, TimelineFieldJobItem[]>> {
  const timelines = await fetchWorkTimelinesByDates(storeId, dates);
  const flat: Record<string, TimelineFieldJobItem[]> = {};
  for (const [date, timeline] of Object.entries(timelines)) {
    flat[date] = extractFieldJobs(timeline);
  }
  return flat;
}

export function countFieldJobs(map: Record<string, TimelineFieldJobItem[]>, date: string): number {
  return map[date]?.length ?? 0;
}
