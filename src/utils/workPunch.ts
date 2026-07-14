import * as Location from 'expo-location';

import { ensureLocationPermissionForPunch } from './locationPermission';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import { postWorkPunch } from '../api/todayWork';
import type { LeaveRequest } from '../context/AuthContext';
import type { CurrentPunchAction, EmployeePunchPayload, TodayWorkSummary, TimelineFieldJobItem } from '../types/fieldService';
import {
  findLeaveCoveringFieldJob,
  isFieldJobLeaveApproved,
} from './fieldLeaveEligibility';
import { isInFieldOutPunchWindow, findPunchableFieldClockInJob, shouldShowFieldHeroInService } from './fieldMissedPunchEligibility';
import { hasOpenFullLeaveForShift } from './leaveRequestEligibility';
import { getPunchDevicePayload } from './punchDevice';
import { getApproximateServerNowDate } from './serverClock';

const DONE_ACTION: CurrentPunchAction = { action: 'DONE' };

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
  WAITING: 'todayActionWaiting',
  DONE: 'todayActionDone',
};

const actionHintKey: Partial<Record<CurrentPunchAction['action'], string>> = {
  STORE_CLOCK_IN: 'todayHintStoreClockIn',
  STORE_CLOCK_OUT: 'todayHintStoreClockOut',
  FIELD_CLOCK_IN: 'todayHintFieldClockIn',
  FIELD_CLOCK_IN_SYNC_STORE: 'todayHintFieldClockIn',
  FIELD_CLOCK_OUT: 'todayHintFieldClockOut',
  FIELD_CLOCK_OUT_SYNC_STORE: 'todayHintFieldClockOut',
  WAITING: 'todayActionWaiting',
  DONE: 'todayActionDone',
};

/** 始终按 action 取 i18n，忽略后端中文 buttonLabel */
export function workPunchTitleKey(action: CurrentPunchAction): string {
  return actionLabelKey[action.action] ?? 'todayActionUnknown';
}

export function workPunchHintKey(action: CurrentPunchAction): string | null {
  return actionHintKey[action.action] ?? null;
}

export function formatWorkPunchTitle(
  action: CurrentPunchAction,
  t: (key: string) => string,
): string {
  return t(workPunchTitleKey(action));
}

export function formatWorkPunchHint(
  action: CurrentPunchAction,
  t: (key: string) => string,
): string {
  const key = workPunchHintKey(action);
  return key ? t(key) : '';
}

/** 后端返回 WAITING 但已到外勤完成打卡窗口时，客户端补全可打卡动作 */
export function resolveEffectiveWorkAction(
  workAction: CurrentPunchAction | undefined,
  activeFieldJob: TimelineFieldJobItem | undefined,
  now: Date = getApproximateServerNowDate(),
): CurrentPunchAction | undefined {
  if (!workAction || !activeFieldJob) return workAction;
  if (isFieldJobLeaveApproved(activeFieldJob)) return workAction;
  if (workAction.action !== 'WAITING') return workAction;
  if (!activeFieldJob.fieldClockInAt || activeFieldJob.fieldClockOutAt) return workAction;
  if (!isInFieldOutPunchWindow(activeFieldJob, now)) return workAction;

  const sync = activeFieldJob.syncStoreClockOut;
  return {
    action: sync ? 'FIELD_CLOCK_OUT_SYNC_STORE' : 'FIELD_CLOCK_OUT',
    refType: 'field_job',
    refId: activeFieldJob.id,
    geofence: null,
  };
}

function isFieldJobLeaveCovered(
  job: TimelineFieldJobItem,
  requests: LeaveRequest[],
): boolean {
  return isFieldJobLeaveApproved(job, requests) || !!findLeaveCoveringFieldJob(requests, job.id);
}

/**
 * Hero 用打卡动作：请假等审/已通过的外勤与整段请假店班不再要求打卡；部分请假店班仍可打卡。
 */
export function resolveHeroWorkAction(params: {
  workAction?: CurrentPunchAction;
  activeFieldJob?: TimelineFieldJobItem;
  fieldJobs?: TimelineFieldJobItem[];
  storeShifts?: MyPublishedShiftSlot[];
  requests?: LeaveRequest[];
  workDateIso: string;
  now?: Date;
  /** 本地 Hero 已无店班焦点（均整段请假或已完成） */
  storeHeroExhausted?: boolean;
}): CurrentPunchAction | undefined {
  const requests = params.requests ?? [];
  const fieldJobs = params.fieldJobs ?? [];
  const storeShifts = params.storeShifts ?? [];
  let action = resolveEffectiveWorkAction(
    params.workAction,
    params.activeFieldJob,
    params.now,
  );

  // 外勤已到开始打卡窗：优先外勤开始，避免被仍开着的早班店班上班窗盖住
  const punchableFieldIn = findPunchableFieldClockInJob(fieldJobs, requests, params.now);
  if (punchableFieldIn) {
    const sync = punchableFieldIn.syncStoreClockIn;
    action = {
      action: sync ? 'FIELD_CLOCK_IN_SYNC_STORE' : 'FIELD_CLOCK_IN',
      refType: 'field_job',
      refId: punchableFieldIn.id,
      geofence: null,
    };
  }

  if (action?.refType === 'field_job' && action.refId) {
    const job =
      fieldJobs.find((row) => row.id === action!.refId) ??
      ({ id: action.refId, type: 'field_job' } as TimelineFieldJobItem);
    if (isFieldJobLeaveCovered(job, requests)) {
      action = DONE_ACTION;
    }
  }

  if (action?.refType === 'store_shift' && action.refId) {
    const slot = storeShifts.find((row) => row.id === String(action!.refId));
    if (slot && hasOpenFullLeaveForShift(requests, params.workDateIso, slot)) {
      action = DONE_ACTION;
    }
  }

  // 无外勤视为已覆盖；有外勤则须全部请假覆盖
  const allFieldsLeaveCovered =
    fieldJobs.length === 0 ||
    fieldJobs.every((job) => isFieldJobLeaveCovered(job, requests));
  const hasNonLeaveStoreShift = storeShifts.some(
    (slot) => !hasOpenFullLeaveForShift(requests, params.workDateIso, slot),
  );

  // 无可打卡店班（无店班或全部整段请假），且外勤无/已请假 → 今日无需再打卡
  if (allFieldsLeaveCovered && !hasNonLeaveStoreShift) {
    return DONE_ACTION;
  }

  // 本地已无店班 Hero 焦点时，WAITING 一律视为已完成（外勤若可打会在上方被改写）
  if (action?.action === 'WAITING' && params.storeHeroExhausted) {
    return DONE_ACTION;
  }

  // 仅有请假外勤、后端仍推送店班打卡时，若本地无店班则视为完成
  if (
    allFieldsLeaveCovered &&
    storeShifts.length === 0 &&
    action &&
    (action.action === 'STORE_CLOCK_IN' || action.action === 'STORE_CLOCK_OUT')
  ) {
    return DONE_ACTION;
  }

  return action;
}

/** 外勤「服务中」是否应挡住店班「离店下班」：仅同步店班下班的外勤才挡住（由外勤完成代打） */
export function fieldBlocksHeroStoreClockOut(params: {
  activeFieldJob?: TimelineFieldJobItem;
  now?: Date;
}): boolean {
  const now = params.now ?? getApproximateServerNowDate();
  const job = params.activeFieldJob;
  if (!job?.syncStoreClockOut) return false;
  return shouldShowFieldHeroInService(job, now);
}

export async function executeWorkPunch(params: {
  storeId: string | number;
  action: CurrentPunchAction;
}): Promise<TodayWorkSummary> {
  const punchType = mapActionToPunchType(params.action.action);
  if (!punchType || !params.action.refType || !params.action.refId) {
    throw new Error('WORK_PUNCH_INVALID_ACTION');
  }

  const perm = await ensureLocationPermissionForPunch();
  if (!perm.granted) {
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
