import { apiRequest } from './client';
import type { AppEmployeePublishedSchedule } from './types';

export function fetchMyPublishedSchedule(params: {
  storeId: string | number;
  from: string;
  to: string;
}) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiRequest<AppEmployeePublishedSchedule>(`/api/v1/app/schedule/published${suffix}`, {
    storeId: params.storeId,
  });
}
