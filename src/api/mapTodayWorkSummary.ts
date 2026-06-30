import type {
  CurrentPunchAction,
  TimelineFieldJobItem,
  TimelineStoreShiftItem,
  TodayWorkSummary,
  TodayWorkTimelineItem,
} from '../types/fieldService';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function normalizeItemType(raw: Record<string, unknown>): string {
  return asString(raw.type || raw.itemType || raw.item_type)
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function isFieldJobType(type: string): boolean {
  return type === 'field_job' || type === 'fieldjob' || type === 'field' || type === 'field_service';
}

function looksLikeFieldJob(raw: Record<string, unknown>): boolean {
  const type = normalizeItemType(raw);
  if (isFieldJobType(type)) return true;
  if (type === 'store_shift' || type === 'storeshift' || type === 'shift') return false;
  return !!(raw.customerName || raw.customer_name || raw.serviceAddress || raw.service_address);
}

function mapFieldJob(raw: Record<string, unknown>): TimelineFieldJobItem {
  return {
    type: 'field_job',
    id: asString(raw.id || raw.jobId || raw.job_id),
    start: asString(raw.start || raw.startTime || raw.start_time),
    end: asString(raw.end || raw.endTime || raw.end_time),
    customerName: asString(raw.customerName || raw.customer_name),
    customerPhone: asString(raw.customerPhone || raw.customer_phone) || undefined,
    serviceAddress: asString(raw.serviceAddress || raw.service_address),
    serviceType: asString(raw.serviceType || raw.service_type),
    latitude: asNumber(raw.latitude),
    longitude: asNumber(raw.longitude),
    geofenceRadius: asNumber(raw.geofenceRadius ?? raw.geofence_radius, 100),
    syncStoreClockIn: asBool(raw.syncStoreClockIn ?? raw.sync_store_clock_in),
    syncStoreClockOut: asBool(raw.syncStoreClockOut ?? raw.sync_store_clock_out),
    fieldClockInAt: asString(raw.fieldClockInAt || raw.field_clock_in_at) || null,
    fieldClockOutAt: asString(raw.fieldClockOutAt || raw.field_clock_out_at) || null,
  };
}

function mapStoreShift(raw: Record<string, unknown>): TimelineStoreShiftItem {
  return {
    type: 'store_shift',
    id: asString(raw.id || raw.publishedCellId || raw.published_cell_id || raw.scheduleId || raw.schedule_id),
    start: asString(raw.start || raw.startTime || raw.start_time),
    end: asString(raw.end || raw.endTime || raw.end_time),
    storeName: asString(raw.storeName || raw.store_name),
    storeId: asString(raw.storeId || raw.store_id) || undefined,
    storeClockInAt: asString(raw.storeClockInAt || raw.store_clock_in_at) || null,
    storeClockOutAt: asString(raw.storeClockOutAt || raw.store_clock_out_at) || null,
    latitude: raw.latitude === undefined ? undefined : asNumber(raw.latitude),
    longitude: raw.longitude === undefined ? undefined : asNumber(raw.longitude),
    geofenceRadius:
      raw.geofenceRadius === undefined && raw.geofence_radius === undefined
        ? undefined
        : asNumber(raw.geofenceRadius ?? raw.geofence_radius),
  };
}

function appendNestedFieldJobs(timeline: TodayWorkTimelineItem[], raw: Record<string, unknown>) {
  const nested = raw.fieldJobs ?? raw.field_jobs;
  if (!Array.isArray(nested)) return;
  for (const item of nested) {
    timeline.push(mapFieldJob(asRecord(item)));
  }
}

function buildTimeline(source: Record<string, unknown>): TodayWorkTimelineItem[] {
  const timeline: TodayWorkTimelineItem[] = [];
  const rawTimeline = source.timeline ?? source.items ?? source.events;

  if (Array.isArray(rawTimeline)) {
    for (const item of rawTimeline) {
      const rec = asRecord(item);
      if (looksLikeFieldJob(rec)) {
        timeline.push(mapFieldJob(rec));
        continue;
      }
      timeline.push(mapStoreShift(rec));
      appendNestedFieldJobs(timeline, rec);
    }
  }

  const extra = source.fieldJobs ?? source.field_jobs;
  if (Array.isArray(extra)) {
    for (const item of extra) {
      timeline.push(mapFieldJob(asRecord(item)));
    }
  }

  return timeline;
}

function mapCurrentPunchAction(raw: Record<string, unknown>): CurrentPunchAction {
  const geofenceRaw = asRecord(raw.geofence);
  return {
    action: asString(raw.action, 'WAITING') as CurrentPunchAction['action'],
    refType: (asString(raw.refType || raw.ref_type) || undefined) as CurrentPunchAction['refType'],
    refId: asString(raw.refId || raw.ref_id) || undefined,
    hint: asString(raw.hint) || undefined,
    buttonLabel: asString(raw.buttonLabel || raw.button_label) || undefined,
    geofence:
      geofenceRaw.lat !== undefined
        ? {
            lat: asNumber(geofenceRaw.lat),
            lng: asNumber(geofenceRaw.lng),
            radius: asNumber(geofenceRaw.radius, 100),
          }
        : null,
  };
}

export function mapTodayWorkSummary(input: unknown): TodayWorkSummary {
  const raw = asRecord(input);
  const summaryRaw = asRecord(raw.summary);
  const source = Object.keys(summaryRaw).length > 0 ? summaryRaw : raw;
  const currentRaw = asRecord(source.currentPunchAction || source.current_punch_action);

  return {
    date: asString(source.date),
    timeline: buildTimeline(source),
    dayStatus: asString(source.dayStatus || source.day_status, 'not_started') as TodayWorkSummary['dayStatus'],
    currentPunchAction: mapCurrentPunchAction(currentRaw),
  };
}
