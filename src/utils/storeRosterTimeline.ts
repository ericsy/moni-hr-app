import type { StoreDayFieldJob } from '../api/mapStoreFieldJobs';
import type { StoreDayRegionGroup, StoreDayShiftGroup } from '../api/mapStorePublishedSchedule';
import { normalizeDateKey } from './calendarDateKey';
import { parseShiftRange } from './shiftClockWindow';

type TimeWindowMs = { startMs: number; endMs: number };

export type StoreRosterShiftTimelineEntry = {
  kind: 'shift';
  areaName: string;
  shift: StoreDayShiftGroup;
  fieldJobs: StoreDayFieldJob[];
  startMs: number;
};

export type StoreRosterFieldTimelineEntry = {
  kind: 'field_job';
  job: StoreDayFieldJob;
  startMs: number;
};

export type StoreRosterTimelineEntry = StoreRosterShiftTimelineEntry | StoreRosterFieldTimelineEntry;

type FlatStoreShift = {
  areaName: string;
  shift: StoreDayShiftGroup;
  startMs: number;
  endMs: number;
};

function dateAtMinutes(workDateIso: string, minutes: number, dayOffset = 0): Date | null {
  const workDate = normalizeDateKey(workDateIso);
  if (!workDate) return null;
  const [y, m, d] = workDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + dayOffset, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function hmWindowOnDate(workDateIso: string, startMin: number, endMin: number): TimeWindowMs | null {
  const overnight = endMin <= startMin;
  const start = dateAtMinutes(workDateIso, startMin, 0);
  const end = dateAtMinutes(workDateIso, endMin, overnight ? 1 : 0);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function shiftWindow(shift: StoreDayShiftGroup, workDateIso: string): TimeWindowMs | null {
  const parsed = parseShiftRange(shift.range);
  if (!parsed) return null;
  return hmWindowOnDate(workDateIso, parsed.startMin, parsed.endMin);
}

function fieldJobWindow(job: StoreDayFieldJob, workDateIso: string): TimeWindowMs | null {
  const startMin = parseHm(job.startTime);
  const endMin = parseHm(job.endTime);
  if (startMin == null || endMin == null) return null;
  return hmWindowOnDate(workDateIso, startMin, endMin);
}

/** 外勤开始/结束时刻均在店班时段内 */
export function storeFieldJobWithinShift(
  job: StoreDayFieldJob,
  shift: StoreDayShiftGroup,
  workDateIso: string,
): boolean {
  const jobWin = fieldJobWindow(job, workDateIso);
  const shiftWin = shiftWindow(shift, workDateIso);
  if (!jobWin || !shiftWin) return false;
  return jobWin.startMs >= shiftWin.startMs && jobWin.endMs <= shiftWin.endMs;
}

function flattenShifts(regions: StoreDayRegionGroup[], workDateIso: string): FlatStoreShift[] {
  const out: FlatStoreShift[] = [];
  for (const region of regions) {
    for (const shift of region.shifts) {
      const window = shiftWindow(shift, workDateIso);
      if (!window) continue;
      out.push({
        areaName: region.areaName,
        shift,
        startMs: window.startMs,
        endMs: window.endMs,
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return out;
}

function findShiftForFieldJob(
  job: StoreDayFieldJob,
  shifts: FlatStoreShift[],
  workDateIso: string,
): FlatStoreShift | undefined {
  const linkedId = job.linkedStoreShiftId?.trim();
  if (linkedId) {
    const linked = shifts.find((s) => s.shift.cellIds.includes(linkedId));
    if (linked) return linked;
  }
  for (const entry of shifts) {
    if (storeFieldJobWithinShift(job, entry.shift, workDateIso)) {
      return entry;
    }
  }
  return undefined;
}

/** 店铺排班日视图：按开始时间排序；外勤落在店班时段内则嵌套在对应班次下 */
export function buildStoreRosterTimeline(
  regions: StoreDayRegionGroup[],
  fieldJobs: StoreDayFieldJob[],
  workDateIso: string,
): StoreRosterTimelineEntry[] {
  const flatShifts = flattenShifts(regions, workDateIso);
  const fieldJobsByShiftKey = new Map<string, StoreDayFieldJob[]>();
  const standaloneFieldJobs: StoreDayFieldJob[] = [];

  const shiftKey = (entry: FlatStoreShift) =>
    `${entry.areaName}\0${entry.shift.shiftName}\0${entry.shift.range}\0${entry.shift.isSubstitution ? 'sub' : 'normal'}`;

  for (const job of fieldJobs) {
    const host = findShiftForFieldJob(job, flatShifts, workDateIso);
    if (host) {
      const key = shiftKey(host);
      if (!fieldJobsByShiftKey.has(key)) fieldJobsByShiftKey.set(key, []);
      fieldJobsByShiftKey.get(key)!.push(job);
    } else {
      standaloneFieldJobs.push(job);
    }
  }

  for (const jobs of fieldJobsByShiftKey.values()) {
    jobs.sort((a, b) => {
      const aw = fieldJobWindow(a, workDateIso);
      const bw = fieldJobWindow(b, workDateIso);
      return (aw?.startMs ?? 0) - (bw?.startMs ?? 0);
    });
  }

  const timeline: StoreRosterTimelineEntry[] = [];

  for (const entry of flatShifts) {
    const nested = fieldJobsByShiftKey.get(shiftKey(entry)) ?? [];
    timeline.push({
      kind: 'shift',
      areaName: entry.areaName,
      shift: entry.shift,
      fieldJobs: nested,
      startMs: entry.startMs,
    });
  }

  for (const job of standaloneFieldJobs) {
    const window = fieldJobWindow(job, workDateIso);
    timeline.push({
      kind: 'field_job',
      job,
      startMs: window?.startMs ?? Number.MAX_SAFE_INTEGER,
    });
  }

  timeline.sort((a, b) => a.startMs - b.startMs);
  return timeline;
}

export function storeTimelineHasContent(entries: StoreRosterTimelineEntry[]): boolean {
  return entries.some((entry) => {
    if (entry.kind === 'field_job') return true;
    return (
      entry.shift.staff.length > 0 ||
      entry.fieldJobs.length > 0
    );
  });
}
