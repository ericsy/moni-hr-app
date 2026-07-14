export type ApiLang = 'zh' | 'en';

export type ApiResult<T> = {
  code: number;
  message: string;
  data: T;
};

export type StoreBrief = {
  id: number;
  name: string;
  /** 跨商户：门店所属商户 */
  merchantId?: number;
  merchantName?: string;
  /** 该门店是否已配置店长（merchant_store_office.store_manager） */
  hasStoreManager?: boolean;
  has_store_manager?: boolean;
};

/** 员工职位（EmployeeRole）：与存库 code 一致 */
export type AppEmployeeRole = {
  code?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
};

export type AppEmployeeUser = {
  id: number;
  merchantId?: number;
  email: string;
  /** 手机号（merchant_admin.phone） */
  phone?: string | null;
  name?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  lastStoreId?: number | null;
  storeIds?: number[];
  storeDetails?: StoreBrief[];
  /** 员工职位（展示名见 nameZh / nameEn） */
  role?: AppEmployeeRole | null;
  /** 担任店长的门店（merchant_store_office.store_manager） */
  storeManagerStores?: StoreBrief[];
  /** 担任副店长的门店（merchant_store_office.deputy_manager） */
  deputyManagerStores?: StoreBrief[];
};

export type AppChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type AppLoginResult = {
  accessToken: string;
  expiresIn?: number;
  user: AppEmployeeUser;
};

/** 兼容 camelCase / snake_case / 历史字段名 */
export function pickAccessToken(
  result: AppLoginResult | (AppLoginResult & Record<string, unknown>),
): string | null {
  const r = result as Record<string, unknown>;
  const raw = r.accessToken ?? r.access_token ?? r.token;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type AppActivationSendCodeRequest = {
  email: string;
};

export type AppActivationSendCode = {
  sent: boolean;
  retryAfterSeconds?: number;
};

export type AppAccountLookupStatus = 'not_found' | 'needs_activation' | 'ready';

export type AppAccountLookup = {
  status: AppAccountLookupStatus;
};

export type AppActivationRequest = {
  email: string;
  code: string;
  password: string;
};

export type AppPasswordResetRequest = {
  email: string;
  code: string;
  password: string;
};

export type AppEmployeeScheduleItem = {
  id: number;
  areaId: number;
  areaName: string;
  /** 自由时段可为 null */
  shiftId?: number | null;
  shiftName?: string | null;
  date_str: string;
  startTime: string;
  endTime: string;
  color?: string | null;
  isSubstitution?: boolean;
  substitutionId?: number | null;
};

export type AppEmployeePublishedSchedule = {
  storeId: number;
  items: AppEmployeeScheduleItem[];
};

export type AppStoreRosterStatus = 'normal' | 'substitution' | 'on_leave';

export type AppStoreScheduleEmployee = {
  id: number;
  name: string;
  rosterStatus?: AppStoreRosterStatus | null;
};

export type AppStoreScheduleItem = {
  id: number;
  areaId: number;
  areaName: string;
  /** 自由时段可为 null */
  shiftId?: number | null;
  shiftName?: string | null;
  date_str: string;
  startTime: string;
  endTime: string;
  color?: string | null;
  isSubstitution?: boolean;
  substitutionId?: number | null;
  originalDisplayName?: string | null;
  employees: AppStoreScheduleEmployee[];
};

export type AppStorePublishedSchedule = {
  storeId: number;
  items: AppStoreScheduleItem[];
};

export type AppStoreFieldJobAssignee = {
  id: number;
  name: string;
};

export type AppStoreFieldJobItem = {
  id: number;
  date_str: string;
  startTime: string;
  endTime: string;
  customerName: string;
  serviceAddress: string;
  serviceType?: string | null;
  status?: string | null;
  syncStoreClockIn?: boolean | null;
  syncStoreClockOut?: boolean | null;
  linkedStoreShiftId?: number | null;
  assignees: AppStoreFieldJobAssignee[];
};

export type AppStorePublishedFieldJobs = {
  storeId: number;
  items: AppStoreFieldJobItem[];
};

export type AppClockPunchRequest = {
  publishedCellId: number;
  punchType: 'clock_in' | 'clock_out';
  deviceType: 'ios' | 'android';
  deviceId: string;
  latitude: number;
  longitude: number;
};

export type AppClockPunchResult = {
  id: number;
  publishedCellId: number;
  punchType: string;
  withinGeofence: boolean;
  distanceMeters: number;
  punchedAt: string;
  /** 打卡时排班快照（重发布后仍可与当前排班按时段匹配） */
  scheduleDate?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  areaName?: string | null;
  shiftName?: string | null;
  suspectedProxyPunch?: boolean;
  proxyPunchReason?: string | null;
  proxySharedDeviceOtherMerchantAdminIds?: number[] | null;
  punchSource?: string | null;
  /** store_shift / field_job */
  refType?: 'store_shift' | 'field_job' | string | null;
  refId?: number | null;
  /** none / store_clock_in / store_clock_out */
  syncEffect?: 'none' | 'store_clock_in' | 'store_clock_out' | string | null;
  /** 外勤客户名（仅 field_job） */
  customerName?: string | null;
};

/** GET /api/v1/app/clock/punches?date=yyyy-MM-dd */
export type AppClockPunchesByDay = {
  storeId: number;
  date: string;
  punches: AppClockPunchResult[];
};

export type AppAttendanceLeaveItemRequest = {
  publishedCellId: number;
  leaveScope: 'full' | 'partial';
  partialStartTime?: string;
  partialEndTime?: string;
};

export type FieldLeaveDispositionRequest = {
  fieldJobId: number;
  /** cancel | reassign */
  action: 'cancel' | 'reassign';
  assigneeMerchantAdminId?: number;
};

export type DutyLeaveDispositionRequest = {
  impactKey: string;
  templateId?: number;
  workDate?: string;
  publishedCellId?: number | null;
  /** skip | reassign */
  action: 'skip' | 'reassign';
  assigneeMerchantAdminId?: number;
};

export type AppAttendanceDutyImpact = {
  id?: number;
  leaveItemId?: number;
  templateId: number;
  publishedCellId?: number | null;
  workDate?: string;
  triggerType?: string;
  overlapType?: string;
  requiredAction?: string;
  title?: string;
  description?: string;
  windowStart?: string;
  windowEnd?: string;
  assignmentMode?: string;
  impactKey: string;
};

export type AppAttendanceDutyDisposition = {
  id?: number;
  impactKey: string;
  templateId?: number;
  workDate?: string;
  publishedCellId?: number | null;
  action?: string;
  assigneeMerchantAdminId?: number | null;
  source?: string;
};

export type AppAttendanceFieldImpact = {
  id?: number;
  leaveItemId?: number;
  fieldJobId: number;
  linkedStoreShiftId?: number | null;
  /** none | partial | full */
  overlapType?: string;
  /** none | required */
  requiredAction?: string;
  customerName?: string;
  serviceType?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  syncStoreClockIn?: boolean;
  syncStoreClockOut?: boolean;
};

export type AppAttendanceFieldDisposition = {
  id?: number;
  fieldJobId: number;
  action?: string;
  assigneeMerchantAdminId?: number | null;
  source?: string;
};

export type AppAttendanceRequestCreate = {
  requestType: 'leave' | 'missed_punch';
  leaveMode?: 'shift' | 'date_range' | 'field_job';
  leaveDateFrom?: string;
  leaveDateTo?: string;
  reason: string;
  leaveItems?: AppAttendanceLeaveItemRequest[];
  publishedCellId?: number;
  fieldJobId?: number | null;
  linkedStoreShiftId?: number | null;
  syncStoreClockIn?: boolean | null;
  syncStoreClockOut?: boolean | null;
  serviceAddress?: string | null;
  punchType?: 'clock_in' | 'clock_out';
  actualPunchedAt?: string;
  overnightPairCellId?: number;
  overnightRole?: 'start' | 'end';
  /** 新版：已确认须处置的外勤 fieldJobId */
  acknowledgedFieldJobIds?: number[];
  fieldDispositions?: FieldLeaveDispositionRequest[];
  /** 已确认须处置的 Duty impactKey */
  acknowledgedDutyImpactKeys?: string[];
  dutyDispositions?: DutyLeaveDispositionRequest[];
};

export type ScheduleSubstitutionBrief = {
  substitutionId?: number;
  substituteMerchantAdminId?: number;
  substituteDisplayName?: string;
  substituteStartTime?: string;
  substituteEndTime?: string;
  substitutionStatus?: string;
};

export type LeaveSubstitutionReviewItem = {
  leaveItemId: number;
  substituteMerchantAdminId: number;
  substituteStartTime?: string;
  substituteEndTime?: string;
};

export type AppAttendanceLeaveItem = {
  id?: number;
  publishedCellId: number;
  leaveScope?: string;
  /** full | late_in | early_out；partial 提交时由服务端计算 */
  leaveEffect?: 'full' | 'late_in' | 'early_out' | string;
  partialStartTime?: string | null;
  partialEndTime?: string | null;
  scheduleDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  substitution?: ScheduleSubstitutionBrief | null;
};

export type AppAttendanceRequest = {
  id: number;
  storeId: number;
  requestType: string;
  leaveMode?: 'shift' | 'date_range' | 'field_job' | string;
  leaveDateFrom?: string | null;
  leaveDateTo?: string | null;
  status: string;
  reason: string;
  approverMerchantAdminId?: number;
  approverKind?: string;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  publishedCellId?: number | null;
  fieldJobId?: number | null;
  linkedStoreShiftId?: number | null;
  syncStoreClockIn?: boolean | null;
  syncStoreClockOut?: boolean | null;
  serviceAddress?: string | null;
  punchType?: string | null;
  actualPunchedAt?: string | null;
  /** 漏打卡：关联 publishedCellId 的排班日期 */
  scheduleDate?: string | null;
  /** 漏打卡：班次开始/结束 HH:mm */
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  areaName?: string | null;
  applicantMerchantAdminId?: number;
  applicantName?: string;
  leaveItems?: AppAttendanceLeaveItem[];
  fieldImpacts?: AppAttendanceFieldImpact[];
  fieldDispositions?: AppAttendanceFieldDisposition[];
  dutyImpacts?: AppAttendanceDutyImpact[];
  dutyDispositions?: AppAttendanceDutyDisposition[];
};

export type AppAttendanceRequestList = {
  storeId: number;
  /** 当前门店是否已有店长（副店长是否展示审批分栏依赖此字段） */
  storeHasStoreManager?: boolean;
  store_has_store_manager?: boolean;
  requests: AppAttendanceRequest[];
};

export type AppAttendanceRequestReview = {
  approved: boolean;
  reviewComment?: string;
  substitutions?: LeaveSubstitutionReviewItem[];
  fieldDispositions?: FieldLeaveDispositionRequest[];
  dutyDispositions?: DutyLeaveDispositionRequest[];
};

export type MerchantEmployeeBrief = {
  merchantAdminId?: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  employeeCode?: string;
  email?: string;
  role?: string;
};

/** 考勤申请详情（与 Apifox MerchantAttendanceRequest 一致） */
export type MerchantAttendanceRequest = AppAttendanceRequest & {
  applicant?: MerchantEmployeeBrief | null;
  approver?: MerchantEmployeeBrief | null;
  reviewerMerchantAdminId?: number | null;
  reviewer?: MerchantEmployeeBrief | null;
  proxyReviewer?: MerchantEmployeeBrief | null;
  proxyReview?: boolean | null;
};

/** 某班次在指定日期的上下班打卡时刻（按排班快照匹配，非 publishedCellId） */
export type ShiftPunchRecord = {
  /** 当前格子 id，仅用于展示/提交新打卡 */
  scheduleId: string;
  /** 班次身份键：日期 + 起止时刻（+ 区域/班次名） */
  shiftKey: string;
  workDate: string;
  scheduledRange: string;
  clockInAt?: string;
  clockOutAt?: string;
};
