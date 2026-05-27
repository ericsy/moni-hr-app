import { apiRequest } from './client';
import type { AppClockPunchRequest, AppClockPunchResult, AppClockPunchesByDay } from './types';

export function postClockPunch(params: { storeId: string | number; body: AppClockPunchRequest }) {
  return apiRequest<AppClockPunchResult>('/api/v1/app/clock/punch', {
    method: 'POST',
    storeId: params.storeId,
    body: params.body,
  });
}

/** 按天查询当前员工在门店的打卡记录（date 为 yyyy-MM-dd，按门店打卡时区日历日筛选） */
export function fetchClockPunchesByDay(params: { storeId: string | number; date: string }) {
  const q = new URLSearchParams({ date: params.date });
  return apiRequest<AppClockPunchesByDay>(`/api/v1/app/clock/punches?${q.toString()}`, {
    storeId: params.storeId,
  });
}
