import { fetchTodayWorkSummary } from '../api/todayWork';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type {
  TimelineFieldJobItem,
  TodayWorkSummary,
  TodayWorkTimelineItem,
} from '../types/fieldService';
import { calendarDateKey, normalizeDateKey } from './calendarDateKey';
import {
  fieldJobWorkDate,
} from './fieldMissedPunchEligibility';
import { parseShiftRange } from './shiftClockWindow';

export function extractFieldJobs(timeline: TodayWorkTimelineItem[]): TimelineFieldJobItem[] {
  return timeline.filter((item): item is TimelineFieldJobItem => item.type === 'field_job');
}

/** 已打外勤上班、尚未完成下班的外勤任务（服务进行中；请假已通过的不参与 Hero） */
export function findActiveFieldJob(timeline: TodayWorkTimelineItem[]): TimelineFieldJobItem | undefined {
  return extractFieldJobs(timeline).find(
    (job) => !job.leaveApproved && !!job.fieldClockInAt && !job.fieldClockOutAt,
  );
}

function jobKey(job: TimelineFieldJobItem): string {
  return job.id || `${job.start}|${job.end}|${job.customerName}`;
}

function dedupeFieldJobs(jobs: TimelineFieldJobItem[]): TimelineFieldJobItem[] {
  const seen = new Set<string>();
  const out: TimelineFieldJobItem[] = [];
  for (const job of jobs) {
    const key = jobKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

type TimeWindowMs = { startMs: number; endMs: number };

function dateAtMinutes(workDateIso: string, minutes: number, dayOffset = 0): Date | null {
  const workDate = normalizeDateKey(workDateIso);
  if (!workDate) return null;
  const [y, m, d] = workDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + dayOffset, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function parseHm(value: string): number | null {
  const s = value.trim();
  const plain = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (plain) return Number(plain[1]) * 60 + Number(plain[2]);
  const iso = /T(\d{1,2}):(\d{2})/.exec(s);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  return null;
}

function parseFieldJobWindow(job: TimelineFieldJobItem, workDateIso?: string): TimeWindowMs | null {
  const startRaw = job.start?.trim() ?? '';
  const endRaw = job.end?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(startRaw) && /^\d{4}-\d{2}-\d{2}T/.test(endRaw)) {
    const startMs = Date.parse(startRaw);
    const endMs = Date.parse(endRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return { startMs, endMs: endMs > startMs ? endMs : endMs + 86_400_000 };
  }

  const workDate = normalizeDateKey(workDateIso) || fieldJobWorkDate(job);
  const startMin = parseHm(startRaw);
  const endMin = parseHm(endRaw);
  if (startMin == null || endMin == null) return null;
  const overnight = endMin <= startMin;
  const start = dateAtMinutes(workDate, startMin, 0);
  const end = dateAtMinutes(workDate, endMin, overnight ? 1 : 0);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function parseShiftSlotWindow(shift: MyPublishedShiftSlot, workDateIso: string): TimeWindowMs | null {
  const parsed = parseShiftRange(shift.range);
  const workDate = normalizeDateKey(workDateIso);
  if (!parsed || !workDate) return null;
  const overnight = parsed.endMin <= parsed.startMin;
  const start = dateAtMinutes(workDate, parsed.startMin, 0);
  const end = dateAtMinutes(workDate, parsed.endMin, overnight ? 1 : 0);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** 外勤与店班时段重叠才视为关联（与后端 fieldLinksToStoreShift 一致） */
export function fieldJobOverlapsShift(
  job: TimelineFieldJobItem,
  shift: MyPublishedShiftSlot,
  workDateIso?: string,
): boolean {
  const jobWindow = parseFieldJobWindow(job, workDateIso);
  const shiftWindow = parseShiftSlotWindow(shift, workDateIso || fieldJobWorkDate(job));
  if (!jobWindow || !shiftWindow) return false;
  return jobWindow.startMs < shiftWindow.endMs && jobWindow.endMs > shiftWindow.startMs;
}

function findOverlappingShift(
  job: TimelineFieldJobItem,
  shifts: MyPublishedShiftSlot[],
  workDateIso?: string,
): MyPublishedShiftSlot | undefined {
  const date = workDateIso || fieldJobWorkDate(job);
  for (const shift of shifts) {
    if (fieldJobOverlapsShift(job, shift, date)) return shift;
  }
  return undefined;
}

/** 将外勤工单挂到时段重叠的店班下；无重叠则独立展示（已完成外勤仍保留在列表） */
export function resolveFieldJobsForSchedule(
  shifts: MyPublishedShiftSlot[],
  timeline: TodayWorkTimelineItem[],
  workDateIso?: string,
): {
  fieldJobsByShiftId: Record<string, TimelineFieldJobItem[]>;
  standaloneFieldJobs: TimelineFieldJobItem[];
  allFieldJobs: TimelineFieldJobItem[];
} {
  const allFieldJobs = dedupeFieldJobs(extractFieldJobs(timeline));
  const fieldJobsByShiftId: Record<string, TimelineFieldJobItem[]> = {};
  const standaloneFieldJobs: TimelineFieldJobItem[] = [];
  const date = workDateIso || calendarDateKey(new Date());
  const publishedShiftIds = new Set(shifts.map((s) => s.id));

  const pushToShift = (shiftId: string, job: TimelineFieldJobItem) => {
    if (!fieldJobsByShiftId[shiftId]) fieldJobsByShiftId[shiftId] = [];
    fieldJobsByShiftId[shiftId].push(job);
  };

  for (const job of allFieldJobs) {
    const linkedId = job.linkedStoreShiftId?.trim();
    if (linkedId && publishedShiftIds.has(linkedId)) {
      pushToShift(linkedId, job);
      continue;
    }

    const shift = findOverlappingShift(job, shifts, date);
    if (shift) {
      pushToShift(shift.id, job);
    } else {
      standaloneFieldJobs.push(job);
    }
  }

  // 店班不在今日排班列表时，外勤改为独立展示，避免挂在看不见的班次下
  for (const [shiftId, jobs] of Object.entries(fieldJobsByShiftId)) {
    if (!publishedShiftIds.has(shiftId)) {
      standaloneFieldJobs.push(...jobs);
      delete fieldJobsByShiftId[shiftId];
    }
  }

  return {
    fieldJobsByShiftId,
    standaloneFieldJobs: dedupeFieldJobs(standaloneFieldJobs),
    allFieldJobs,
  };
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
