export type PunchRefType = 'store_shift' | 'field_job';

export type PunchActionType =
  | 'STORE_CLOCK_IN'
  | 'FIELD_CLOCK_IN'
  | 'FIELD_CLOCK_IN_SYNC_STORE'
  | 'FIELD_CLOCK_OUT'
  | 'FIELD_CLOCK_OUT_SYNC_STORE'
  | 'STORE_CLOCK_OUT'
  | 'WAITING'
  | 'DONE';

export type DayWorkStatus = 'not_started' | 'in_progress' | 'done';

export interface TimelineStoreShiftItem {
  type: 'store_shift';
  id: string;
  start: string;
  end: string;
  storeName: string;
  storeId?: string;
  storeClockInAt?: string | null;
  storeClockOutAt?: string | null;
  latitude?: number;
  longitude?: number;
  geofenceRadius?: number;
}

export interface TimelineFieldJobItem {
  type: 'field_job';
  id: string;
  start: string;
  end: string;
  customerName: string;
  customerPhone?: string;
  serviceAddress: string;
  serviceType?: string;
  notes?: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  syncStoreClockIn: boolean;
  syncStoreClockOut: boolean;
  /** 后端 timeline 嵌套挂载的店班 published cell id */
  linkedStoreShiftId?: string;
  fieldClockInAt?: string | null;
  fieldClockOutAt?: string | null;
}

export type TodayWorkTimelineItem = TimelineStoreShiftItem | TimelineFieldJobItem;

export interface PunchGeofence {
  lat: number;
  lng: number;
  radius: number;
}

export interface CurrentPunchAction {
  action: PunchActionType;
  refType?: PunchRefType;
  refId?: string;
  geofence?: PunchGeofence | null;
  hint?: string;
  buttonLabel?: string;
}

export interface TodayWorkSummary {
  date: string;
  timeline: TodayWorkTimelineItem[];
  currentPunchAction: CurrentPunchAction;
  dayStatus: DayWorkStatus;
}

export interface EmployeePunchPayload {
  refType: PunchRefType;
  refId: string;
  punchType: 'clock_in' | 'clock_out';
  latitude: number;
  longitude: number;
  deviceType: 'ios' | 'android';
  deviceId: string;
}
