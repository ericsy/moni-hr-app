import { apiRequest } from './client';
import { mapTodayWorkSummary } from './mapTodayWorkSummary';
import type { EmployeePunchPayload, TodayWorkSummary } from '../types/fieldService';

export async function fetchTodayWorkSummary(params: {
  storeId: string | number;
  date: string;
}): Promise<TodayWorkSummary> {
  const q = new URLSearchParams({ date: params.date });
  const data = await apiRequest<unknown>(`/api/v1/app/today-work-summary?${q.toString()}`, {
    storeId: params.storeId,
  });
  return mapTodayWorkSummary(data);
}

export async function postWorkPunch(params: {
  storeId: string | number;
  payload: EmployeePunchPayload;
}): Promise<TodayWorkSummary> {
  const data = await apiRequest<unknown>('/api/v1/app/work/punch', {
    method: 'POST',
    storeId: params.storeId,
    body: {
      refType: params.payload.refType,
      refId: params.payload.refId,
      punchType: params.payload.punchType,
      latitude: params.payload.latitude,
      longitude: params.payload.longitude,
      deviceType: params.payload.deviceType,
      deviceId: params.payload.deviceId,
    },
  });
  return mapTodayWorkSummary(data);
}
