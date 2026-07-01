import * as Location from 'expo-location';

import { postWorkPunch } from '../api/todayWork';
import type { CurrentPunchAction, EmployeePunchPayload, TodayWorkSummary, TimelineFieldJobItem } from '../types/fieldService';
import { isInFieldOutPunchWindow, shouldShowFieldHeroInService } from './fieldMissedPunchEligibility';
import { getPunchDevicePayload } from './punchDevice';
import { getApproximateServerNowDate } from './serverClock';

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

export function isClockOutWorkAction(action: CurrentPunchAction['action']): boolean {
  return (
    action === 'STORE_CLOCK_OUT' ||
    action === 'FIELD_CLOCK_OUT' ||
    action === 'FIELD_CLOCK_OUT_SYNC_STORE'
  );
}

export function isClockInWorkAction(action: CurrentPunchAction['action']): boolean {
  return (
    action === 'STORE_CLOCK_IN' ||
    action === 'FIELD_CLOCK_IN' ||
    action === 'FIELD_CLOCK_IN_SYNC_STORE'
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

/** 后端返回 WAITING 但已到外勤完成打卡窗口时，客户端补全可打卡动作 */
export function resolveEffectiveWorkAction(
  workAction: CurrentPunchAction | undefined,
  activeFieldJob: TimelineFieldJobItem | undefined,
  now: Date = getApproximateServerNowDate(),
): CurrentPunchAction | undefined {
  if (!workAction || !activeFieldJob) return workAction;
  if (workAction.action !== 'WAITING') return workAction;
  if (!activeFieldJob.fieldClockInAt || activeFieldJob.fieldClockOutAt) return workAction;
  if (!isInFieldOutPunchWindow(activeFieldJob, now)) return workAction;

  const sync = activeFieldJob.syncStoreClockOut;
  return {
    action: sync ? 'FIELD_CLOCK_OUT_SYNC_STORE' : 'FIELD_CLOCK_OUT',
    refType: 'field_job',
    refId: activeFieldJob.id,
    hint: '请在客户地址附近完成服务',
    buttonLabel: sync ? '完成服务（今日下班）' : '完成服务',
    geofence: null,
  };
}

/** 外勤「服务中」是否应挡住店班「离店下班」（仅实打卡 + 时段） */
export function fieldBlocksHeroStoreClockOut(params: {
  activeFieldJob?: TimelineFieldJobItem;
  now?: Date;
}): boolean {
  const now = params.now ?? getApproximateServerNowDate();
  return !!(
    params.activeFieldJob && shouldShowFieldHeroInService(params.activeFieldJob, now)
  );
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
  const { deviceType, deviceId } = getPunchDevicePayload();
  return postWorkPunch({
    storeId: params.storeId,
    payload: {
      refType: params.action.refType,
      refId: params.action.refId,
      punchType,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      deviceType,
      deviceId,
    },
  });
}
