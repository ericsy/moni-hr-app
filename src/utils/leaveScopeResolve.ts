import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../api/types';
import type { RequestShiftBinding } from '../context/AuthContext';
import { defaultPartialLeaveForPunch } from './partialLeaveConstraints';
import { findSlotForSelectionKey, shiftSelectionKeyFromBinding } from './requestShiftBinding';

export type LeaveTimeSpanMode = { mode: 'full' | 'partial'; from?: string; to?: string };

/** 与请假创建页 UI 一致：不可整段时默认按部分时段处理 */
export function resolveEffectiveLeaveScope(
  key: string,
  leaveScopeByKey: Record<string, 'full' | 'partial'>,
  fullLeaveBlocked?: boolean,
): 'full' | 'partial' {
  const stored = leaveScopeByKey[key];
  if (stored) return stored;
  return fullLeaveBlocked ? 'partial' : 'full';
}

export function buildLeaveTimesByScheduleKey(
  shifts: RequestShiftBinding[],
  scheduleByDate: Record<string, MyPublishedShiftSlot[]>,
  leaveScopeByKey: Record<string, 'full' | 'partial'>,
  partialLeaveByKey: Record<string, { from: string; to: string }>,
  getShiftPunch: (workDate: string, slot: MyPublishedShiftSlot) => ShiftPunchRecord | undefined,
  isFullLeaveBlocked: (slot: MyPublishedShiftSlot, workDate: string) => boolean,
): Record<string, LeaveTimeSpanMode> {
  const out: Record<string, LeaveTimeSpanMode> = {};
  for (const shift of shifts) {
    const key = shiftSelectionKeyFromBinding(shift);
    const found = findSlotForSelectionKey(scheduleByDate, key);
    const fullBlocked = found ? isFullLeaveBlocked(found.slot, found.workDate) : false;
    const scope = resolveEffectiveLeaveScope(key, leaveScopeByKey, fullBlocked);
    if (scope === 'partial') {
      const punch = found ? getShiftPunch(found.workDate, found.slot) : undefined;
      const def = found ? defaultPartialLeaveForPunch(punch, found.slot.range) : null;
      const p = partialLeaveByKey[key] ?? def ?? undefined;
      if (p?.from && p?.to) {
        out[key] = { mode: 'partial', from: p.from, to: p.to };
      } else {
        out[key] = { mode: 'full' };
      }
    } else {
      out[key] = { mode: 'full' };
    }
  }
  return out;
}
