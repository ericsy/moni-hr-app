import { apiRequest } from './client';
import type {
  AppEmployeePublishedSchedule,
  AppStorePublishedFieldJobs,
  AppStorePublishedSchedule,
} from './types';

function scheduleQuerySuffix(from?: string, to?: string): string {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return q.toString() ? `?${q.toString()}` : '';
}

export function fetchMyPublishedSchedule(params: {
  storeId: string | number;
  from: string;
  to: string;
}) {
  return apiRequest<AppEmployeePublishedSchedule>(
    `/api/v1/app/schedule/published${scheduleQuerySuffix(params.from, params.to)}`,
    { storeId: params.storeId },
  );
}

export function fetchStorePublishedSchedule(params: {
  storeId: string | number;
  from: string;
  to: string;
}) {
  return apiRequest<AppStorePublishedSchedule>(
    `/api/v1/app/schedule/store-published${scheduleQuerySuffix(params.from, params.to)}`,
    { storeId: params.storeId },
  );
}

export function fetchStorePublishedFieldJobs(params: {
  storeId: string | number;
  from: string;
  to: string;
}) {
  return apiRequest<AppStorePublishedFieldJobs>(
    `/api/v1/app/schedule/store-field-jobs${scheduleQuerySuffix(params.from, params.to)}`,
    { storeId: params.storeId },
  );
}
