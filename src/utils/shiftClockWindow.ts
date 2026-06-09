/** 班次打卡时间窗（与后端 /api/v1/app/clock/punch 规则对齐：上班开始前 10 分钟至下班；下班仅班次结束后 20 分钟内） */

import { calendarDateKey, normalizeDateKey } from './calendarDateKey';
import type { OvernightRole } from './overnightShiftPair';
import { compareDateKeys } from './localDateTime';

export type ShiftPunchTimes = {
  clockInAt?: string;
  clockOutAt?: string;
};

export type ShiftCardActions = {
  /** 是否展示打卡状态提示（未拉取到当日打卡记录前为 false） */
  showStatus: boolean;
  statusKey: string;
  statusParams?: { time?: string };
  showClockIn: boolean;
  showClockOut: boolean;
  /** @deprecated 请用 showMissedApply；保留兼容旧逻辑 */
  showApply: boolean;
  /** 是否可展示漏打卡申请入口 */
  showMissedApply: boolean;
  emphasizeMissedApply: boolean;
};

function punchesPending(
  workDateIso: string,
  todayIso: string,
  punchesKnown: boolean,
): boolean {
  const workDate = normalizeDateKey(workDateIso);
  const today = normalizeDateKey(todayIso);
  if (!workDate || !today) return !punchesKnown;
  return !punchesKnown && compareDateKeys(workDate, today) <= 0;
}

function shiftPunchComplete(
  punch: ShiftPunchTimes | undefined,
  overnightRole?: OvernightRole,
): boolean {
  if (overnightRole === 'start') return !!punch?.clockInAt;
  if (overnightRole === 'end') return !!punch?.clockOutAt;
  return !!punch?.clockInAt && !!punch?.clockOutAt;
}

function pendingPunchActions(): ShiftCardActions {
  return {
    showStatus: false,
    statusKey: '',
    showClockIn: false,
    showClockOut: false,
    showApply: false,
    showMissedApply: false,
    emphasizeMissedApply: false,
  };
}

/** 上班打卡：开始前 N 分钟（与接口一致） */
const CLOCK_IN_EARLY_MIN = 10;
/** 下班打卡：结束后 N 分钟内（与接口一致） */
const CLOCK_OUT_AFTER_END_MIN = 20;

function parseHm(hm: string): number | null {
  const s = hm.trim();
  const plain = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (plain) return Number(plain[1]) * 60 + Number(plain[2]);
  const iso = /T(\d{1,2}):(\d{2})/.exec(s);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  return null;
}

/** 解析排班时段中的起止时刻（兼容 en/em dash、ISO 前缀、HH:mm:ss） */
export function parseShiftRange(range: string): { startMin: number; endMin: number } | null {
  const normalized = range.replace(/\s+/g, ' ').trim();
  const matched = /(\d{1,2}:\d{2}(?::\d{2})?).*?[–—−‐‑‒-].*?(\d{1,2}:\d{2}(?::\d{2})?)/.exec(
    normalized,
  );
  if (matched) {
    const startMin = parseHm(matched[1]);
    const endMin = parseHm(matched[2]);
    if (startMin != null && endMin != null) return { startMin, endMin };
  }
  const parts = normalized.split(/[–—−‐‑‒-]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const startMin = parseHm(parts[0]);
  const endMin = parseHm(parts[parts.length - 1]);
  if (startMin == null || endMin == null) return null;
  return { startMin, endMin };
}

function dateAtMinutes(workDateIso: string, minutes: number, dayOffset = 0): Date | null {
  const key = normalizeDateKey(workDateIso);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + dayOffset, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function missedPunchWindowEndAt(
  workDateIso: string,
  range: string,
  punchKind: 'in' | 'out',
): Date | null {
  const parsed = parseShiftRange(range);
  const workDate = normalizeDateKey(workDateIso);
  if (!parsed || !workDate) return null;
  const overnight = parsed.endMin <= parsed.startMin;
  if (punchKind === 'in') {
    return dateAtMinutes(workDate, parsed.endMin, overnight ? 1 : 0);
  }
  const endMin = parsed.endMin + CLOCK_OUT_AFTER_END_MIN;
  return dateAtMinutes(workDate, endMin, overnight ? 1 : 0);
}

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function formatHmFromIso(iso: string): string {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

function resolvePunchState(
  punch: ShiftPunchTimes | undefined,
  overnightRole: OvernightRole,
  pairPunch?: ShiftPunchTimes,
) {
  const displayPunch =
    overnightRole === 'start'
      ? { clockInAt: punch?.clockInAt }
      : overnightRole === 'end'
        ? { clockOutAt: punch?.clockOutAt }
        : punch;
  const hasIn =
    overnightRole === 'end'
      ? !!(pairPunch?.clockInAt || punch?.clockInAt)
      : !!displayPunch?.clockInAt;
  const hasOut = overnightRole === 'start' ? false : !!displayPunch?.clockOutAt;
  return { displayPunch, hasIn, hasOut };
}

/**
 * 当前是否已过可申请漏打卡的时刻（仅判断「今天」；历史日期由 canApplyMissedPunchKind 另行处理）。
 * 上班漏打卡：正常上班打卡窗口（至班次结束）已结束；
 * 下班漏打卡：正常下班打卡窗口（班次结束 +20 分钟）已结束。
 */
export function isMissedPunchApplyTimeReached(
  workDateIso: string,
  range: string,
  punchKind: 'in' | 'out',
  now: Date = new Date(),
  todayIso: string = calendarDateKey(now),
): boolean {
  const workDate = normalizeDateKey(workDateIso);
  const today = normalizeDateKey(todayIso);
  if (!workDate || !today) return false;
  if (compareDateKeys(workDate, today) > 0) return false;
  if (compareDateKeys(workDate, today) < 0) return true;
  const deadline = missedPunchWindowEndAt(workDate, range, punchKind);
  if (!deadline) return false;
  return now.getTime() > deadline.getTime();
}

/** @deprecated 请用 isMissedPunchApplyTimeReached */
export function isMissedPunchDeadlinePassed(
  range: string,
  punchKind: 'in' | 'out',
  now: Date = new Date(),
): boolean {
  return isMissedPunchApplyTimeReached(calendarDateKey(now), range, punchKind, now);
}

/** 当前是否可申请某一类型的漏打卡（不含待审批占用等业务拦截） */
export function canApplyMissedPunchKind(
  workDateIso: string,
  range: string,
  punch: ShiftPunchTimes | undefined,
  todayIso: string,
  punchKind: 'in' | 'out',
  now: Date = new Date(),
  overnightRole: OvernightRole = 'normal',
  pairPunch?: ShiftPunchTimes,
): boolean {
  if (punchKind === 'in' && overnightRole === 'end') return false;
  if (punchKind === 'out' && overnightRole === 'start') return false;

  const workDate = normalizeDateKey(workDateIso);
  const today = normalizeDateKey(todayIso);
  if (!workDate || !today) return false;

  const { hasIn, hasOut } = resolvePunchState(punch, overnightRole, pairPunch);
  if (punchKind === 'in' && hasIn) return false;
  if (punchKind === 'out' && hasOut) return false;

  if (compareDateKeys(workDate, today) > 0) return false;
  if (compareDateKeys(workDate, today) < 0) return true;

  return isMissedPunchApplyTimeReached(workDate, range, punchKind, now, today);
}

/** 当前班次是否至少可申请一种漏打卡 */
export function canApplyMissedPunchForShift(
  workDateIso: string,
  range: string,
  punch: ShiftPunchTimes | undefined,
  todayIso: string,
  now: Date = new Date(),
  overnightRole: OvernightRole = 'normal',
  pairPunch?: ShiftPunchTimes,
): boolean {
  return (
    canApplyMissedPunchKind(
      workDateIso,
      range,
      punch,
      todayIso,
      'in',
      now,
      overnightRole,
      pairPunch,
    ) ||
    canApplyMissedPunchKind(
      workDateIso,
      range,
      punch,
      todayIso,
      'out',
      now,
      overnightRole,
      pairPunch,
    )
  );
}

function withMissedApply(
  actions: Omit<ShiftCardActions, 'showMissedApply' | 'showApply'> & {
    showMissedApply?: boolean;
    showApply?: boolean;
  },
  missedApplyAllowed: boolean,
): ShiftCardActions {
  const showMissedApply = actions.showMissedApply ?? missedApplyAllowed;
  const { showMissedApply: _ignored, showApply: _legacy, ...rest } = actions;
  return {
    ...rest,
    showMissedApply,
    showApply: actions.showApply ?? showMissedApply,
  };
}

/** 跨天夜班末段：配对首段上的上班卡（用于判断可否下班打卡） */
export function getShiftCardActions(
  workDateIso: string,
  range: string,
  punch: ShiftPunchTimes | undefined,
  todayIso: string,
  /** 建议使用 `getApproximateServerNowDate()`，减轻用户篡改系统时间对按钮显隐的影响 */
  now: Date = new Date(),
  /** 当日打卡接口已成功返回后为 true */
  punchesKnown = true,
  overnightRole: OvernightRole = 'normal',
  pairPunch?: ShiftPunchTimes,
): ShiftCardActions {
  const parsed = parseShiftRange(range);
  const workDate = normalizeDateKey(workDateIso);
  const today = normalizeDateKey(todayIso) || calendarDateKey(now);
  const { displayPunch, hasIn, hasOut } = resolvePunchState(punch, overnightRole, pairPunch);
  const missedApplyAllowed =
    punchesKnown &&
    canApplyMissedPunchForShift(
      workDate,
      range,
      punch,
      today,
      now,
      overnightRole,
      pairPunch,
    );

  if (compareDateKeys(workDate, today) > 0) {
    return withMissedApply(
      {
        showStatus: true,
        statusKey: 'shiftStatusFuture',
        showClockIn: false,
        showClockOut: false,
        showMissedApply: false,
        emphasizeMissedApply: false,
      },
      missedApplyAllowed,
    );
  }

  if (punchesPending(workDate, today, punchesKnown)) {
    return pendingPunchActions();
  }

  if (compareDateKeys(workDate, today) < 0) {
    const complete = shiftPunchComplete(displayPunch, overnightRole);
    const incomplete = !complete;
    return withMissedApply(
      {
        showStatus: true,
        statusKey: incomplete ? 'shiftStatusPastIncomplete' : 'shiftStatusCompleted',
        showClockIn: false,
        showClockOut: false,
        emphasizeMissedApply: incomplete,
      },
      missedApplyAllowed,
    );
  }

  // 今天
  if (hasIn && hasOut) {
    return withMissedApply(
      {
        showStatus: true,
        statusKey: 'shiftStatusCompleted',
        statusParams: { time: formatHmFromIso(displayPunch!.clockInAt!) },
        showClockIn: false,
        showClockOut: false,
        showMissedApply: false,
        emphasizeMissedApply: false,
      },
      missedApplyAllowed,
    );
  }

  if (!parsed) {
    return withMissedApply(
      {
        showStatus: true,
        statusKey: hasIn ? 'shiftStatusClockedIn' : 'shiftStatusToday',
        statusParams: displayPunch?.clockInAt
          ? { time: formatHmFromIso(displayPunch.clockInAt) }
          : undefined,
        showClockIn: overnightRole !== 'end' && !hasIn,
        showClockOut: overnightRole !== 'start' && hasIn && !hasOut,
        emphasizeMissedApply: false,
      },
      missedApplyAllowed,
    );
  }

  const nowMin = nowMinutes(now);
  const clockInWindowStart = parsed.startMin - CLOCK_IN_EARLY_MIN;
  const clockInWindowEnd = parsed.endMin;
  const clockOutWindowStart = parsed.endMin;
  const clockOutWindowEnd = parsed.endMin + CLOCK_OUT_AFTER_END_MIN;

  const canClockInNow = nowMin >= clockInWindowStart && nowMin <= clockInWindowEnd;
  const beforeClockInWindow = nowMin < clockInWindowStart;
  const afterClockInWindow = nowMin > clockInWindowEnd;

  if (hasIn && !hasOut) {
    const canClockOutNow =
      overnightRole !== 'start' &&
      nowMin >= clockOutWindowStart &&
      nowMin <= clockOutWindowEnd;

    if (overnightRole === 'start') {
      return withMissedApply(
        {
          showStatus: true,
          statusKey: 'shiftStatusClockedInWaitEnd',
          statusParams: { time: formatHmFromIso(displayPunch!.clockInAt!) },
          showClockIn: false,
          showClockOut: false,
          emphasizeMissedApply: false,
        },
        missedApplyAllowed,
      );
    }

    if (nowMin < clockOutWindowStart) {
      return withMissedApply(
        {
          showStatus: true,
          statusKey: 'shiftStatusClockedInWaitEnd',
          statusParams: { time: formatHmFromIso(displayPunch!.clockInAt!) },
          showClockIn: false,
          showClockOut: false,
          emphasizeMissedApply: false,
        },
        missedApplyAllowed,
      );
    }
    if (canClockOutNow) {
      return withMissedApply(
        {
          showStatus: true,
          statusKey: 'shiftStatusClockedIn',
          statusParams: { time: formatHmFromIso(displayPunch!.clockInAt!) },
          showClockIn: false,
          showClockOut: true,
          emphasizeMissedApply: false,
        },
        missedApplyAllowed,
      );
    }
    return withMissedApply(
      {
        showStatus: true,
        statusKey: 'shiftStatusPastIncomplete',
        statusParams: { time: formatHmFromIso(displayPunch!.clockInAt!) },
        showClockIn: false,
        showClockOut: false,
        emphasizeMissedApply: true,
      },
      missedApplyAllowed,
    );
  }

  // 未上班打卡
  if (beforeClockInWindow) {
    return withMissedApply(
      {
        showStatus: true,
        statusKey: 'shiftStatusUpcoming',
        showClockIn: false,
        showClockOut: false,
        emphasizeMissedApply: false,
      },
      missedApplyAllowed,
    );
  }

  if (canClockInNow && overnightRole !== 'end') {
    return withMissedApply(
      {
        showStatus: true,
        statusKey: 'shiftStatusCanClockIn',
        showClockIn: true,
        showClockOut: false,
        emphasizeMissedApply: false,
      },
      missedApplyAllowed,
    );
  }

  // 已过可上班打卡时段且未打上班卡
  return withMissedApply(
    {
      showStatus: true,
      statusKey: 'shiftStatusPastIncomplete',
      showClockIn: false,
      showClockOut: false,
      emphasizeMissedApply: afterClockInWindow,
    },
    missedApplyAllowed,
  );
}
