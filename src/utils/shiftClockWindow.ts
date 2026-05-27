/** 班次打卡时间窗（与后端 /api/v1/app/clock/punch 规则对齐：上班开始前 10 分钟至下班；下班仅班次结束后 20 分钟内） */

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
  showApply: boolean;
  emphasizeMissedApply: boolean;
};

function punchesPending(
  workDateIso: string,
  todayIso: string,
  punchesKnown: boolean,
): boolean {
  return !punchesKnown && workDateIso <= todayIso;
}

function shiftPunchComplete(punch: ShiftPunchTimes | undefined): boolean {
  return !!punch?.clockInAt && !!punch?.clockOutAt;
}

function pendingPunchActions(showApply = true): ShiftCardActions {
  return {
    showStatus: false,
    statusKey: '',
    showClockIn: false,
    showClockOut: false,
    showApply,
    emphasizeMissedApply: false,
  };
}

/** 上班打卡：开始前 N 分钟（与接口一致） */
const CLOCK_IN_EARLY_MIN = 10;
/** 下班打卡：结束后 N 分钟内（与接口一致） */
const CLOCK_OUT_AFTER_END_MIN = 20;

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 解析 "08:30–12:30" / "08:30-12:30" */
export function parseShiftRange(range: string): { startMin: number; endMin: number } | null {
  const parts = range.split(/[–-]/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const startMin = parseHm(parts[0]);
  const endMin = parseHm(parts[1]);
  if (startMin == null || endMin == null) return null;
  return { startMin, endMin };
}

function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function formatHmFromIso(iso: string): string {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

export function getShiftCardActions(
  workDateIso: string,
  range: string,
  punch: ShiftPunchTimes | undefined,
  todayIso: string,
  /** 建议使用 `getApproximateServerNowDate()`，减轻用户篡改系统时间对按钮显隐的影响 */
  now: Date = new Date(),
  /** 当日打卡接口已成功返回后为 true */
  punchesKnown = true,
): ShiftCardActions {
  const parsed = parseShiftRange(range);
  const hasIn = !!punch?.clockInAt;
  const hasOut = !!punch?.clockOutAt;

  if (workDateIso > todayIso) {
    return {
      showStatus: true,
      statusKey: 'shiftStatusFuture',
      showClockIn: false,
      showClockOut: false,
      showApply: true,
      emphasizeMissedApply: false,
    };
  }

  if (punchesPending(workDateIso, todayIso, punchesKnown)) {
    return pendingPunchActions();
  }

  if (workDateIso < todayIso) {
    const complete = shiftPunchComplete(punch);
    const incomplete = !complete;
    return {
      showStatus: true,
      statusKey: incomplete ? 'shiftStatusPastIncomplete' : 'shiftStatusCompleted',
      showClockIn: false,
      showClockOut: false,
      showApply: !complete,
      emphasizeMissedApply: incomplete,
    };
  }

  // 今天
  if (hasIn && hasOut) {
    return {
      showStatus: true,
      statusKey: 'shiftStatusCompleted',
      statusParams: { time: formatHmFromIso(punch!.clockInAt!) },
      showClockIn: false,
      showClockOut: false,
      showApply: false,
      emphasizeMissedApply: false,
    };
  }

  if (!parsed) {
    return {
      showStatus: true,
      statusKey: hasIn ? 'shiftStatusClockedIn' : 'shiftStatusToday',
      statusParams: punch?.clockInAt ? { time: formatHmFromIso(punch.clockInAt) } : undefined,
      showClockIn: !hasIn,
      showClockOut: hasIn && !hasOut,
      showApply: true,
      emphasizeMissedApply: false,
    };
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
    const canClockOutNow = nowMin >= clockOutWindowStart && nowMin <= clockOutWindowEnd;
    const missedClockOut = nowMin > clockOutWindowEnd;

    if (nowMin < clockOutWindowStart) {
      return {
        showStatus: true,
        statusKey: 'shiftStatusClockedInWaitEnd',
        statusParams: { time: formatHmFromIso(punch!.clockInAt!) },
        showClockIn: false,
        showClockOut: false,
        showApply: true,
        emphasizeMissedApply: false,
      };
    }
    if (canClockOutNow) {
      return {
        showStatus: true,
        statusKey: 'shiftStatusClockedIn',
        statusParams: { time: formatHmFromIso(punch!.clockInAt!) },
        showClockIn: false,
        showClockOut: true,
        showApply: true,
        emphasizeMissedApply: false,
      };
    }
    return {
      showStatus: true,
      statusKey: 'shiftStatusPastIncomplete',
      statusParams: { time: formatHmFromIso(punch!.clockInAt!) },
      showClockIn: false,
      showClockOut: false,
      showApply: true,
      emphasizeMissedApply: true,
    };
  }

  // 未上班打卡
  if (beforeClockInWindow) {
    return {
      showStatus: true,
      statusKey: 'shiftStatusUpcoming',
      showClockIn: false,
      showClockOut: false,
      showApply: true,
      emphasizeMissedApply: false,
    };
  }

  if (canClockInNow) {
    return {
      showStatus: true,
      statusKey: 'shiftStatusCanClockIn',
      showClockIn: true,
      showClockOut: false,
      showApply: true,
      emphasizeMissedApply: false,
    };
  }

  // 已过可上班打卡时段且未打上班卡
  return {
    showStatus: true,
    statusKey: 'shiftStatusPastIncomplete',
    showClockIn: false,
    showClockOut: false,
    showApply: true,
    emphasizeMissedApply: afterClockInWindow,
  };
}
