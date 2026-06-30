import * as Location from 'expo-location';

import { postWorkPunch } from '../api/todayWork';
import type { CurrentPunchAction, EmployeePunchPayload, TodayWorkSummary } from '../types/fieldService';
import { getPunchDeviceId } from './punchDevice';

export function mapActionToPunchType(
  action: CurrentPunchAction['action'],
): EmployeePunchPayload['punchType'] | null {
  if (action === 'STORE_CLOCK_IN' || action === 'FIELD_CLOCK_IN' || action === 'FIELD_CLOCK_IN_SYNC_STORE') {
    return 'clock_in';
  }
  if (action === 'STORE_CLOCK_OUT' || action === 'FIELD_CLOCK_OUT' || action === 'FIELD_CLOCK_OUT_SYNC_STORE') {
    return 'clock_out';
  }
  return null;
}

export function isFieldWorkPunchAction(action: CurrentPunchAction['action']): boolean {
  return (
    action === 'FIELD_CLOCK_IN' ||
    action === 'FIELD_CLOCK_IN_SYNC_STORE' ||
    action === 'FIELD_CLOCK_OUT' ||
    action === 'FIELD_CLOCK_OUT_SYNC_STORE'
  );
}

export function isWorkPunchActionEnabled(action?: CurrentPunchAction | null): boolean {
  if (!action) return false;
  if (action.action === 'WAITING' || action.action === 'DONE') return false;
  return !!action.refType && !!action.refId && !!mapActionToPunchType(action.action);
}

export function workPunchMatchesStoreShift(action: CurrentPunchAction | undefined, scheduleId: string): boolean {
  if (!isWorkPunchActionEnabled(action) || !action) return false;
  return action.refType === 'store_shift' && action.refId === scheduleId;
}

const actionLabelKey: Partial<Record<CurrentPunchAction['action'], string>> = {
  STORE_CLOCK_IN: 'todayActionStoreClockIn',
  STORE_CLOCK_OUT: 'todayActionStoreClockOut',
  FIELD_CLOCK_IN: 'todayActionFieldClockIn',
  FIELD_CLOCK_IN_SYNC_STORE: 'todayActionFieldClockInSyncStore',
  FIELD_CLOCK_OUT: 'todayActionFieldClockOut',
  FIELD_CLOCK_OUT_SYNC_STORE: 'todayActionFieldClockOutSyncStore',
};

export function workPunchTitleKey(action: CurrentPunchAction): string | null {
  if (action.buttonLabel) return null;
  const key = actionLabelKey[action.action];
  return key ?? 'todayActionUnknown';
}

export async function executeWorkPunch(params: {
  storeId: string | number;
  action: CurrentPunchAction;
}): Promise<TodayWorkSummary> {
  const punchType = mapActionToPunchType(params.action.action);
  if (!punchType || !params.action.refType || !params.action.refId) {
    throw new Error('WORK_PUNCH_INVALID_ACTION');
  }

  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('LOCATION_PERMISSION_DENIED');
  }

  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return postWorkPunch({
    storeId: params.storeId,
    payload: {
      refType: params.action.refType,
      refId: params.action.refId,
      punchType,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      deviceId: getPunchDeviceId(),
    },
  });
}
