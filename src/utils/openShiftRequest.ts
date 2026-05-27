import { router } from 'expo-router';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { LeaveRequest } from '../context/AuthContext';

export function openShiftRequest(params: {
  type: LeaveRequest['type'];
  workDate: string;
  slots: MyPublishedShiftSlot[];
  slotIndex: number;
  punchKind?: 'in' | 'out';
}) {
  const slot = params.slots[params.slotIndex];
  router.push({
    pathname: '/request-create',
    params: {
      type: params.type,
      workDate: params.workDate,
      slotIndex: String(params.slotIndex),
      scheduleId: slot?.id ?? '',
      areaName: slot?.areaName ?? '',
      shiftName: slot?.shiftName ?? '',
      range: slot?.range ?? '',
      punchKind: params.punchKind ?? 'in',
    },
  });
}
