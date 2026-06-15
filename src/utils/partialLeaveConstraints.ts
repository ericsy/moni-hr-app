import type { ShiftPunchRecord } from '../api/types';
import { compareHm, defaultPartialFromShiftRange, parseScheduledHmRange } from './localDateTime';
import { hmFromPunchIso } from './shiftLeaveEligibility';

export type PartialLeaveScenarioKind = 'unpunched' | 'late_arrival' | 'early_departure';

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
 * - 迟到（有上班卡且晚于班次开始）→ 仅班次开始 ~ 上班打卡
 * - 早退（有下班卡且早于班次结束）→ 仅下班打卡 ~ 班次结束
 * - 无打卡 → 班次内自选（仍须满足后端晚来/早走形态）
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

  const lateArrival = !!inHm && compareHm(inHm, start) > 0;
  const earlyDeparture = !!outHm && compareHm(outHm, end) < 0;

  if (lateArrival) {
    const toCap = compareHm(inHm!, end) <= 0 ? inHm! : end;
    return {
      kind: 'late_arrival',
      fromFixed: start,
      fromMin: start,
      fromMax: start,
      toMin: start,
      toMax: toCap,
    };
  }

  if (earlyDeparture) {
    const fromFloor = compareHm(outHm!, start) > 0 ? outHm! : start;
    return {
      kind: 'early_departure',
      fromMin: fromFloor,
      fromMax: end,
      toFixed: end,
      toMin: end,
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
  if (scenario.kind === 'unpunched') {
    return defaultPartialFromShiftRange(shiftRange);
  }
  if (scenario.kind === 'late_arrival') {
    return {
      from: scenario.fromFixed ?? scenario.fromMin,
      to: scenario.toMax,
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

  if (scenario.kind === 'late_arrival') {
    to = clampHmToRange(to, scenario.toMin, scenario.toMax);
    if (compareHm(from, to) >= 0) {
      to = scenario.toMax;
    }
    return { from, to };
  }

  if (scenario.kind === 'early_departure') {
    let fromClamped = clampHmToRange(from, scenario.fromMin, scenario.fromMax);
    if (compareHm(fromClamped, to) >= 0) {
      fromClamped = scenario.fromMin;
    }
    return { from: fromClamped, to };
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

/** 是否满足班次内起止 + 后端 early_out / late_in 形态，且不覆盖已打卡在岗时段 */
export function isPartialLeaveValidForScenario(
  partial: { from: string; to: string } | undefined,
  scenario: PartialLeaveScenario | null,
  shiftRange: string,
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

  const { start, end } = bounds;
  const isEarlyOut = compareHm(clamped.from, start) === 0 && compareHm(clamped.to, end) < 0;
  const isLateIn =
    compareHm(clamped.from, start) > 0 &&
    (compareHm(clamped.to, end) === 0 || compareHm(clamped.to, start) > 0);
  if (!isEarlyOut && !isLateIn) return false;

  if (scenario.kind === 'late_arrival' && !isEarlyOut) return false;
  if (scenario.kind === 'early_departure' && !isLateIn) return false;

  return true;
}
