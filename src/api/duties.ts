import { apiRequest } from './client';
import { mapTodayWorkSummary } from './mapTodayWorkSummary';
import type { DutyItem, TodayWorkSummary } from '../types/fieldService';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function mapDutyItem(input: unknown): DutyItem {
  const r = asRecord(input);
  return {
    id: asString(r.id),
    templateId: asString(r.templateId || r.template_id) || undefined,
    title: asString(r.title),
    description: asString(r.description) || undefined,
    triggerType: asString(r.triggerType || r.trigger_type, 'clock_in'),
    required: asBool(r.required ?? true),
    publishedCellId: asString(r.publishedCellId || r.published_cell_id) || undefined,
    sequenceNo:
      r.sequenceNo !== undefined || r.sequence_no !== undefined
        ? Number(r.sequenceNo ?? r.sequence_no)
        : undefined,
    status: asString(r.status, 'pending'),
    windowStart: asString(r.windowStart || r.window_start) || undefined,
    windowEnd: asString(r.windowEnd || r.window_end) || undefined,
    dueAt: asString(r.dueAt || r.due_at) || undefined,
  };
}

export async function completeDuty(params: {
  storeId: string | number;
  instanceId: string | number;
  latitude?: number;
  longitude?: number;
  note?: string;
}): Promise<DutyItem> {
  const data = await apiRequest<unknown>(`/api/v1/app/duties/${params.instanceId}/complete`, {
    method: 'POST',
    storeId: params.storeId,
    body: {
      latitude: params.latitude,
      longitude: params.longitude,
      note: params.note,
    },
  });
  return mapDutyItem(data);
}

/** Completing a duty may unlock canPunch; refresh summary after complete. */
export async function completeDutyAndRefreshSummary(params: {
  storeId: string | number;
  instanceId: string | number;
  date: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}): Promise<TodayWorkSummary> {
  await completeDuty(params);
  const data = await apiRequest<unknown>(
    `/api/v1/app/today-work-summary?date=${encodeURIComponent(params.date)}`,
    { storeId: params.storeId },
  );
  return mapTodayWorkSummary(data);
}
