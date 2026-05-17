/** 演示：我的排班（与排班页、漏打卡申请共用；正式环境由 API 提供） */

export type ShiftKey = 'shiftOpen' | 'shiftMid' | 'shiftClose';
export type RegionKey = 'regionFoH' | 'regionBoH' | 'regionWhs';

export type MyScheduleSlot = {
  region: RegionKey;
  shiftKey: ShiftKey;
  range: string;
  storeId?: string;
};

export const DEMO_MY_SHIFTS: Record<string, MyScheduleSlot[]> = {
  '2026-05-12': [
    { region: 'regionFoH', shiftKey: 'shiftMid', range: '11:00–15:00', storeId: 'store-akl' },
  ],
  '2026-05-13': [
    { region: 'regionFoH', shiftKey: 'shiftOpen', range: '08:30–12:30', storeId: 'store-akl' },
    { region: 'regionBoH', shiftKey: 'shiftClose', range: '17:00–22:00', storeId: 'store-akl' },
  ],
  '2026-05-14': [
    { region: 'regionFoH', shiftKey: 'shiftClose', range: '16:00–21:30', storeId: 'store-chc' },
  ],
  '2026-05-15': [
    { region: 'regionWhs', shiftKey: 'shiftOpen', range: '09:00–14:00', storeId: 'store-akl' },
  ],
  '2026-05-16': [
    { region: 'regionBoH', shiftKey: 'shiftMid', range: '12:00–18:00', storeId: 'store-chc' },
  ],
  '2026-05-17': [],
  '2026-05-18': [
    { region: 'regionFoH', shiftKey: 'shiftOpen', range: '08:00–12:00', storeId: 'store-akl' },
  ],
};

export function getMyShiftsForDay(iso: string): MyScheduleSlot[] {
  return DEMO_MY_SHIFTS[iso] ?? [];
}

/** 同一自然日内多段排班的稳定键（演示用下标；正式环境可用 shiftId） */
export function myShiftSlotKey(iso: string, slotIndex: number): string {
  return `${iso}#${slotIndex}`;
}
