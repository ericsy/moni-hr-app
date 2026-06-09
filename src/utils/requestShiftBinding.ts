import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { RequestShiftBinding } from '../context/AuthContext';
import {
  buildLegacyCellKey,
  buildShiftKeyFromBinding,
  buildShiftKeyFromTarget,
  shiftMatchTargetFromSlot,
} from './shiftIdentity';

export function buildShiftBinding(
  workDate: string,
  slotIndex: number,
  slot: MyPublishedShiftSlot,
): RequestShiftBinding {
  const target = shiftMatchTargetFromSlot(workDate, slot);
  return {
    workDate,
    slotIndex,
    scheduleId: slot.id,
    shiftKey: buildShiftKeyFromTarget(target),
    areaName: slot.areaName,
    shiftName: slot.shiftName,
    scheduledRange: slot.range,
    overnightRole: slot.overnightRole,
    overnightPairCellId: slot.overnightPairCellId,
  };
}

export function formatShiftBindingLine(shift: RequestShiftBinding): string {
  const hasArea = shift.areaName && shift.areaName !== '—';
  const hasShift = shift.shiftName && shift.shiftName !== '—';
  if (hasArea && hasShift) {
    return `${shift.areaName} · ${shift.shiftName} · ${shift.scheduledRange}`;
  }
  const parts = [hasArea ? shift.areaName : null, hasShift ? shift.shiftName : null, shift.scheduledRange].filter(
    Boolean,
  ) as string[];
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** 列表接口无区域/班次名时，用本地已拉取的排班补全展示 */
export function enrichShiftBindingsFromSchedule(
  shifts: RequestShiftBinding[],
  scheduleByDate: Record<string, MyPublishedShiftSlot[]>,
): RequestShiftBinding[] {
  return shifts.map((shift) => {
    if (!shift.workDate) return shift;
    const bindingKey = buildShiftKeyFromBinding(shift);
    const slot = (scheduleByDate[shift.workDate] ?? []).find((s) => {
      const slotKey = buildShiftKeyFromTarget(shiftMatchTargetFromSlot(shift.workDate, s));
      return bindingKey && slotKey === bindingKey;
    });
    if (!slot) return shift;
    return {
      ...shift,
      areaName: shift.areaName === '—' ? slot.areaName : shift.areaName,
      shiftName: shift.shiftName === '—' ? slot.shiftName : shift.shiftName,
      scheduledRange: shift.scheduledRange === '—' ? slot.range : shift.scheduledRange,
    };
  });
}

/** 选班 UI / 本地选中态：用当前格子 id，避免同日相同时段多班碰撞 */
export function shiftSelectionKeyFromSlot(workDate: string, slot: MyPublishedShiftSlot): string {
  return buildLegacyCellKey(workDate, slot.id);
}

export function shiftSelectionKeyFromBinding(shift: RequestShiftBinding): string {
  if (shift.workDate && shift.scheduleId) {
    return buildLegacyCellKey(shift.workDate, shift.scheduleId);
  }
  return buildShiftKeyFromBinding(shift) || `${shift.workDate}|${shift.slotIndex}`;
}

/** @deprecated 优先用 shiftSelectionKeyFromSlot */
export function shiftSelectionKey(workDate: string, slotId: string): string {
  return `${workDate}|${slotId}`;
}

export function findSlotForSelectionKey(
  scheduleByDate: Record<string, MyPublishedShiftSlot[]>,
  key: string,
): { slot: MyPublishedShiftSlot; workDate: string; slotIndex: number } | null {
  const parsed = parseShiftSelectionKey(key);
  if (!parsed) return null;
  const slots = scheduleByDate[parsed.workDate] ?? [];
  const slotIndex = slots.findIndex((s) => {
    if (parsed.slotId.startsWith('cell:')) {
      return shiftSelectionKeyFromSlot(parsed.workDate, s) === parsed.slotId;
    }
    if (parsed.slotId.startsWith('t:')) {
      return buildShiftKeyFromTarget(shiftMatchTargetFromSlot(parsed.workDate, s)) === parsed.slotId;
    }
    return s.id === parsed.slotId;
  });
  if (slotIndex < 0) return null;
  return { slot: slots[slotIndex], workDate: parsed.workDate, slotIndex };
}

export function parseShiftSelectionKey(key: string): { workDate: string; slotId: string } | null {
  if (key.startsWith('t:') || key.startsWith('cell:')) {
    const workDate = key.startsWith('t:') ? key.slice(2).split('|')[0] : key.slice(5).split('|')[0];
    return workDate ? { workDate, slotId: key } : null;
  }
  const i = key.indexOf('|');
  if (i <= 0) return null;
  return { workDate: key.slice(0, i), slotId: key.slice(i + 1) };
}

export function shiftsDateRange(shifts: RequestShiftBinding[]): { start: string; end: string } {
  if (shifts.length === 0) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    return { start: iso, end: iso };
  }
  const sorted = [...shifts].map((s) => s.workDate).sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}
