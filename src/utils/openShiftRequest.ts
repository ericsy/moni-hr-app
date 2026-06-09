import { InteractionManager } from 'react-native';
import { router } from 'expo-router';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { LeaveRequest } from '../context/AuthContext';

import { normalizeDateKeyOrToday } from './calendarDateKey';

/** Expo Router / Android 对 URL 参数中的 Unicode（如 en-dash）较敏感，仅保留 ASCII */
function sanitizeRouteParam(value?: string | string[] | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '')
    .trim()
    .replace(/[^\x20-\x7E]/g, '-')
    .slice(0, 120);
}

export function openShiftRequest(params: {
  type: LeaveRequest['type'];
  workDate: string;
  slots: MyPublishedShiftSlot[];
  slotIndex: number;
  punchKind?: 'in' | 'out';
}) {
  const slot = params.slots[params.slotIndex];
  const workDate = normalizeDateKeyOrToday(params.workDate);
  const routeParams: Record<string, string> = {
    type: params.type,
    workDate,
    slotIndex: String(params.slotIndex),
    scheduleId: sanitizeRouteParam(slot?.id),
  };
  if (params.type === 'missed_punch') {
    routeParams.punchKind = params.punchKind === 'out' ? 'out' : 'in';
  }

  InteractionManager.runAfterInteractions(() => {
    router.push({
      pathname: '/request-create',
      params: routeParams,
    });
  });
}
