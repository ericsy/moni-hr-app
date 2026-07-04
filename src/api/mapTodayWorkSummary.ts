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

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const s = asString(value).trim();
    if (s) return s;
  }
  return undefined;
}

function mergeFieldJobFields(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    target[key] = value;
  }
  return target;
}

function absorbFieldJobRaw(byId: Map<string, Record<string, unknown>>, raw: Record<string, unknown>) {
  const type = normalizeItemType(raw);
  const isJob = isFieldJobType(type) || looksLikeFieldJob(raw);
  if (!isJob) return;
  const id = asString(raw.id || raw.jobId || raw.job_id).trim();
  if (!id) return;
  const prev = byId.get(id);
  byId.set(id, prev ? mergeFieldJobFields({ ...prev }, raw) : { ...raw });
}

function collectFieldJobRaws(source: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const rec = asRecord(item);
      absorbFieldJobRaw(byId, rec);
      const nested = rec.fieldJobs ?? rec.field_jobs;
      if (Array.isArray(nested)) {
        for (const child of nested) absorbFieldJobRaw(byId, asRecord(child));
      }
    }
  };
  walk(source.timeline ?? source.items ?? source.events);
  walk(source.fieldJobs ?? source.field_jobs);
  return byId;
}

function mapFieldJob(
  raw: Record<string, unknown>,
  mergedById?: Map<string, Record<string, unknown>>,
  linkedStoreShiftId?: string,
): TimelineFieldJobItem {
  const id = asString(raw.id || raw.jobId || raw.job_id).trim();
  const merged =
    id && mergedById?.has(id)
      ? mergeFieldJobFields({ ...mergedById.get(id)! }, raw)
      : raw;
  const linked =
    linkedStoreShiftId ||
    pickString(merged.linkedStoreShiftId, merged.linked_store_shift_id);
  return {
    type: 'field_job' as const,
    id: asString(merged.id || merged.jobId || merged.job_id),
    start: asString(merged.start || merged.startTime || merged.start_time),
    end: asString(merged.end || merged.endTime || merged.end_time),
    customerName: asString(merged.customerName || merged.customer_name),
    customerPhone: pickString(merged.customerPhone, merged.customer_phone),
    serviceAddress: asString(merged.serviceAddress || merged.service_address),
    serviceType: pickString(merged.serviceType, merged.service_type),
    notes: pickString(merged.notes, merged.note, merged.remark, merged.remarks, merged.description),
    latitude: asNumber(merged.latitude),
    longitude: asNumber(merged.longitude),
    geofenceRadius: asNumber(merged.geofenceRadius ?? merged.geofence_radius, 100),
    syncStoreClockIn: asBool(merged.syncStoreClockIn ?? merged.sync_store_clock_in),
    syncStoreClockOut: asBool(merged.syncStoreClockOut ?? merged.sync_store_clock_out),
    linkedStoreShiftId: linked,
    fieldClockInAt: asString(merged.fieldClockInAt || merged.field_clock_in_at) || null,
    fieldClockOutAt: asString(merged.fieldClockOutAt || merged.field_clock_out_at) || null,
    leaveApproved: asBool(
      merged.leaveApproved ?? merged.leave_approved ?? merged.leaveApprovedFlag,
    ),
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

function appendNestedFieldJobs(
  timeline: TodayWorkTimelineItem[],
  raw: Record<string, unknown>,
  mergedById: Map<string, Record<string, unknown>>,
) {
  const nested = raw.fieldJobs ?? raw.field_jobs;
  if (!Array.isArray(nested)) return;
  for (const item of nested) {
    timeline.push(mapFieldJob(asRecord(item), mergedById));
  }
}

function buildTimeline(source: Record<string, unknown>): TodayWorkTimelineItem[] {
  const mergedById = collectFieldJobRaws(source);
  const timeline: TodayWorkTimelineItem[] = [];
  const rawTimeline = source.timeline ?? source.items ?? source.events;

  if (Array.isArray(rawTimeline)) {
    for (const item of rawTimeline) {
      const rec = asRecord(item);
      if (looksLikeFieldJob(rec)) {
        timeline.push(mapFieldJob(rec, mergedById));
        continue;
      }
      timeline.push(mapStoreShift(rec));
      appendNestedFieldJobs(timeline, rec, mergedById);
    }
  }

  const extra = source.fieldJobs ?? source.field_jobs;
  if (Array.isArray(extra)) {
    for (const item of extra) {
      timeline.push(mapFieldJob(asRecord(item), mergedById));
    }
  }

  const idsInTimeline = new Set(
    timeline
      .filter((item): item is TimelineFieldJobItem => item.type === 'field_job')
      .map((item) => item.id)
      .filter(Boolean),
  );
  for (const [id, raw] of mergedById) {
    if (!idsInTimeline.has(id)) {
      timeline.push(mapFieldJob(raw, mergedById));
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
