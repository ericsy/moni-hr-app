import type { CurrentPunchAction, TodayWorkSummary } from '../types/fieldService';

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

function mapTimelineItem(raw: Record<string, unknown>): TodayWorkSummary['timeline'][number] {
  const type = asString(raw.type);
  if (type === 'field_job') {
    return {
      type: 'field_job',
      id: asString(raw.id),
      start: asString(raw.start),
      end: asString(raw.end),
      customerName: asString(raw.customerName || raw.customer_name),
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

  return {
    type: 'store_shift',
    id: asString(raw.id),
    start: asString(raw.start),
    end: asString(raw.end),
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
  const timeline = Array.isArray(source.timeline)
    ? source.timeline.map((item) => mapTimelineItem(asRecord(item)))
    : [];
  const currentRaw = asRecord(source.currentPunchAction || source.current_punch_action);

  return {
    date: asString(source.date),
    timeline,
    dayStatus: asString(source.dayStatus || source.day_status, 'not_started') as TodayWorkSummary['dayStatus'],
    currentPunchAction: mapCurrentPunchAction(currentRaw),
  };
}
