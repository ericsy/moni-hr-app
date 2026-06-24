import type { ShiftPunchRecord } from '../api/types';
import { compareHm, defaultPartialFromShiftRange, parseScheduledHmRange } from './localDateTime';
import { hmFromPunchIso, isClockInWithinLateGrace } from './shiftLeaveEligibility';

export type PartialLeaveScenarioKind =
  | 'unpunched'
  | 'clocked_in_only'
  | 'early_departure'
  | 'late_arrival_with_out';

/** 有打卡记录时的部分请假可选范围（对齐后端 late_in / early_out 规则） */
export type PartialLeaveScenario = {
  kind: PartialLeaveScenarioKind;
  fromFixed?: string;
  fromMin: string;
  fromMax: string;
  toFixed?: string;
  toMin: string;
  toMax: string;
};

export function clampHmToRange(hm: string, min: string, max: string): string {
  if (compareHm(hm, min) < 0) return min;
  if (compareHm(hm, max) > 0) return max;
  return hm;
}

/**
 * 根据打卡推断部分请假场景：
 * - 无打卡 → 班次内自选（须满足晚来/早走形态）
 * - 仅上班卡 → 可选迟到段（班次开始～上班打卡）或早退段（上班打卡～班次结束）
 * - 已早退下班卡 → 下班打卡～班次结束
 * - 迟到上班且已打下班卡（含准点下班）→ 班次开始～上班打卡（说明迟到）
 */
export function resolvePartialLeaveScenario(
  punch: ShiftPunchRecord | undefined,
  shiftRange: string,
): PartialLeaveScenario | null {
  const bounds = parseScheduledHmRange(shiftRange);
  if (!bounds) return null;

  const { start, end } = bounds;
  const inHm = punch?.clockInAt ? hmFromPunchIso(punch.clockInAt) : null;
  const outHm = punch?.clockOutAt ? hmFromPunchIso(punch.clockOutAt) : null;

  if (!inHm && !outHm) {
    return {
      kind: 'unpunched',
      fromMin: start,
      fromMax: end,
      toMin: start,
      toMax: end,
    };
  }

  if (inHm && outHm) {
    const earlyDeparture = compareHm(outHm, end) < 0;
    if (earlyDeparture) {
      const fromFloor = compareHm(outHm, start) > 0 ? outHm : start;
      return {
        kind: 'early_departure',
        fromMin: fromFloor,
        fromMax: end,
        toFixed: end,
        toMin: end,
        toMax: end,
      };
    }
    if (isClockInWithinLateGrace(inHm, start)) {
      return null;
    }
    if (compareHm(inHm, start) <= 0) {
      return null;
    }
    return {
      kind: 'late_arrival_with_out',
      fromFixed: start,
      fromMin: start,
      fromMax: start,
      toFixed: inHm,
      toMin: inHm,
      toMax: inHm,
    };
  }

  if (inHm && !outHm) {
    return {
      kind: 'clocked_in_only',
      fromMin: start,
      fromMax: end,
      toMin: start,
      toMax: end,
    };
  }

  return null;
}

export function defaultPartialLeaveForPunch(
  punch: ShiftPunchRecord | undefined,
  shiftRange: string,
): { from: string; to: string } | null {
  const scenario = resolvePartialLeaveScenario(punch, shiftRange);
  if (!scenario) return null;
  const bounds = parseScheduledHmRange(shiftRange);
  if (!bounds) return null;

  if (scenario.kind === 'unpunched') {
    return defaultPartialFromShiftRange(shiftRange);
  }
  if (scenario.kind === 'clocked_in_only') {
    const inHm = punch?.clockInAt ? hmFromPunchIso(punch.clockInAt) : null;
    if (inHm) {
      return { from: inHm, to: bounds.end };
    }
    return defaultPartialFromShiftRange(shiftRange);
  }
  if (scenario.kind === 'late_arrival_with_out') {
    const inHm = punch?.clockInAt ? hmFromPunchIso(punch.clockInAt) : null;
    if (!inHm) return null;
    return {
      from: scenario.fromFixed ?? bounds.start,
      to: scenario.toFixed ?? inHm,
    };
  }
  return {
    from: scenario.fromMin,
    to: scenario.toFixed ?? scenario.toMax,
  };
}

export function clampPartialLeaveToScenario(
  partial: { from: string; to: string },
  scenario: PartialLeaveScenario,
): { from: string; to: string } {
  const from = scenario.fromFixed ?? clampHmToRange(partial.from, scenario.fromMin, scenario.fromMax);
  let to = scenario.toFixed ?? clampHmToRange(partial.to, scenario.toMin, scenario.toMax);

  if (scenario.kind === 'early_departure') {
    let fromClamped = clampHmToRange(from, scenario.fromMin, scenario.fromMax);
    if (compareHm(fromClamped, to) >= 0) {
      fromClamped = scenario.fromMin;
    }
    return { from: fromClamped, to };
  }

  if (scenario.kind === 'late_arrival_with_out') {
    return {
      from: scenario.fromFixed ?? partial.from,
      to: scenario.toFixed ?? partial.to,
    };
  }

  let fromClamped = clampHmToRange(from, scenario.fromMin, scenario.fromMax);
  to = clampHmToRange(to, scenario.toMin, scenario.toMax);
  if (compareHm(fromClamped, to) >= 0) {
    to = clampHmToRange(to, fromClamped, scenario.toMax);
  }
  if (compareHm(fromClamped, to) >= 0) {
    fromClamped = scenario.fromMin;
    to = scenario.toMax;
  }
  return { from: fromClamped, to };
}

function classifyPartialLeavePattern(
  from: string,
  to: string,
  start: string,
  end: string,
): 'early_out' | 'late_in' | null {
  const isEarlyOut = compareHm(from, start) === 0 && compareHm(to, end) < 0;
  const isLateIn =
    compareHm(from, start) > 0 &&
    (compareHm(to, end) === 0 || compareHm(to, start) > 0);
  if (isEarlyOut) return 'early_out';
  if (isLateIn) return 'late_in';
  return null;
}

/** 是否满足班次内起止 + 后端 early_out / late_in 形态，且不覆盖已打卡在岗时段 */
export function isPartialLeaveValidForScenario(
  partial: { from: string; to: string } | undefined,
  scenario: PartialLeaveScenario | null,
  shiftRange: string,
  punch?: ShiftPunchRecord,
): boolean {
  if (!partial?.from || !partial.to || !scenario) return false;
  const bounds = parseScheduledHmRange(shiftRange);
  if (!bounds) return false;

  const clamped = clampPartialLeaveToScenario(partial, scenario);
  if (clamped.from !== partial.from || clamped.to !== partial.to) return false;
  if (compareHm(clamped.from, clamped.to) >= 0) return false;
  if (compareHm(clamped.from, bounds.start) < 0 || compareHm(clamped.to, bounds.end) > 0) {
    return false;
  }

  const pattern = classifyPartialLeavePattern(clamped.from, clamped.to, bounds.start, bounds.end);
  if (!pattern) return false;

  const inHm = punch?.clockInAt ? hmFromPunchIso(punch.clockInAt) : null;
  const outHm = punch?.clockOutAt ? hmFromPunchIso(punch.clockOutAt) : null;

  if (pattern === 'early_out') {
    if (inHm && compareHm(clamped.to, inHm) > 0) return false;
  }

  if (pattern === 'late_in') {
    if (inHm && compareHm(clamped.from, inHm) < 0) return false;
    if (outHm && compareHm(clamped.to, outHm) > 0) return false;
  }

  if (scenario.kind === 'early_departure' && pattern !== 'late_in') return false;
  if (scenario.kind === 'late_arrival_with_out' && pattern !== 'early_out') return false;

  return true;
}
