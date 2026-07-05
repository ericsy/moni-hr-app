import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  cancelAttendanceRequest as cancelAttendanceRequestApi,
  createAttendanceRequest,
  fetchMyAttendanceRequests,
  fetchPendingApprovalAttendanceRequests,
  reviewAttendanceRequest as reviewAttendanceRequestApi,
} from '../api/attendance';
import {
  buildAttendanceCreateBody,
  mapAttendanceRequestToLeaveRequest,
  type SubmitAttendanceInput,
} from '../api/mapAttendanceRequest';
import { enrichShiftBindingsFromSchedule } from '../utils/requestShiftBinding';
import { fetchClockPunchesByDay, postClockPunch } from '../api/clock';
import { applyClockPunchResult, consolidateShiftPunchRecords, mapPunchesByPublishedCell } from '../api/mapClockPunches';
import {
  activateEmployeeAccount,
  changeEmployeePassword,
  confirmPasswordReset,
  fetchCurrentEmployee,
  loginWithEmail,
  lookupAccountByEmail,
  logoutSession,
  sendActivationCode,
  sendPasswordResetCode,
  updateLastStore,
} from '../api/auth';
import {
  API_INVALID_RESPONSE,
  ApiError,
  configureApiClient,
  configureUnauthorizedHandler,
  resetUnauthorizedGuard,
} from '../api/client';
import { mapEmployeeToUser } from '../api/mapEmployeeUser';
import type { AppAccountLookupStatus, AppAttendanceFieldImpact } from '../api/types';
import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../api/types';
import { pickAccessToken } from '../api/types';
import i18n, { setAppLanguage } from '../i18n';
import {
  resetSessionExpiredAlert,
  showSessionExpiredAlert,
} from '../utils/sessionExpiredAlert';
import { getPunchDevicePayload } from '../utils/punchDevice';
import { punchRecordMatchesTarget, shiftMatchTargetFromSlot } from '../utils/shiftIdentity';
import { resetServerClockState, setClockSkewWarningHandler, syncServerTimeFromMillis } from '../utils/serverClock';
import * as Location from 'expo-location';
import { ensureLocationPermissionForPunch } from '../utils/locationPermission';

const AUTH_KEY = 'moni-hr-session-v1';
const TOKEN_KEY = 'moni-hr-access-token';
const LANG_KEY = 'moni-hr-lang-v1';

/** 员工可任职的门店（多店时由 selectedStoreId 决定当前上下文） */
export type StoreRef = {
  id: string;
  name: string;
  merchantId?: string;
  merchantName?: string;
  /** 该门店是否已配置店长；来自 storeDetails / 考勤列表接口 */
  hasStoreManager?: boolean;
};

export type UserRole = 'staff' | 'manager';

export type User = {
  id: string;
  name: string;
  employeeId: string;
  role: UserRole;
  /** 登录/me 下发的职位文案（按 App 语言展示） */
  roleTitleZh?: string;
  roleTitleEn?: string;
  /** 担任店长或副店长的门店 id（用于店铺排班可见性） */
  managedStoreIds: string[];
  storeManagerStoreIds: string[];
  deputyManagerStoreIds: string[];
  activated: boolean;
  email: string;
  phone: string;
  stores: StoreRef[];
  selectedStoreId: string;
};

function migrateUser(u: User & { storeName?: string }): User {
  const managedStoreIds = u.managedStoreIds ?? [];
  const storeManagerStoreIds = u.storeManagerStoreIds ?? managedStoreIds;
  const deputyManagerStoreIds = u.deputyManagerStoreIds ?? [];
  const base = {
    ...u,
    managedStoreIds,
    storeManagerStoreIds,
    deputyManagerStoreIds,
  };
  if (u.stores?.length) {
    return {
      ...base,
      selectedStoreId: u.selectedStoreId ?? u.stores[0].id,
    };
  }
  const fallbackId = 'store-default';
  const label = u.storeName ?? 'Store';
  return {
    ...base,
    stores: [{ id: fallbackId, name: label }],
    selectedStoreId: fallbackId,
  };
}

export function getActiveStore(user: User | undefined): StoreRef | undefined {
  if (!user?.stores?.length) return undefined;
  return user.stores.find((s) => s.id === user.selectedStoreId) ?? user.stores[0];
}

export type { ShiftPunchRecord } from '../api/types';

export type RequestScheduleContext = {
  workDate: string;
  slots: MyPublishedShiftSlot[];
};

/** 请假时段：单段或同日多班每段可单独设置部分时段 */
export type LeaveTimeSpan = {
  mode: 'full' | 'partial';
  from?: string;
  to?: string;
};

/** 请假 / 漏打卡均绑定到已发布排班的一段班次 */
export type RequestShiftBinding = {
  workDate: string;
  slotIndex: number;
  scheduleId?: string;
  /** 班次快照键（日期+时段），用于与历史申请/打卡匹配 */
  shiftKey?: string;
  areaName: string;
  shiftName: string;
  scheduledRange: string;
  overnightRole?: 'start' | 'end' | 'normal';
  overnightPairCellId?: string;
};

export type LeaveRequest = {
  id: string;
  type: 'leave' | 'missed_punch';
  /** shift=按班次 date_range=按日期 field_job=外勤请假 */
  leaveMode?: 'shift' | 'date_range' | 'field_job';
  /** 提交人（演示/对接审批用） */
  applicantId?: string;
  applicantName?: string;
  /** 指定审批人 */
  approverId?: string;
  /** 提交时所在门店 */
  storeId?: string;
  /** 与 shift.workDate 相同，便于列表排序 */
  start: string;
  end: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  /** 请假可多段（多天）；漏打卡为一段 */
  shifts: RequestShiftBinding[];
  /** 仅单段请假：整段或班次内部分时段 */
  leaveTime?: LeaveTimeSpan;
  /** 仅漏打卡 */
  missedPunch?: {
    punchKind: 'in' | 'out';
    proposedTime: string;
  };
  /** 外勤漏打卡关联工单 */
  fieldJob?: {
    id: string;
    customerName: string;
    serviceAddress?: string;
    scheduledRange: string;
    syncStoreClockIn: boolean;
    syncStoreClockOut: boolean;
  };
  /** 店班/按日期请假关联的外勤影响（用于占用外勤请假入口） */
  fieldImpacts?: AppAttendanceFieldImpact[];
};

type Session = {
  user: User;
};

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  language: 'en' | 'zh';
  login: (account: string, password: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
  checkAccountStatus: (
    email: string,
  ) => Promise<{ ok: boolean; status?: AppAccountLookupStatus; message?: string; error?: string }>;
  logout: () => Promise<void>;
  sendActivationCode: (
    email: string,
  ) => Promise<{ ok: boolean; retryAfterSeconds?: number; message?: string; error?: string }>;
  activateAccount: (
    email: string,
    code: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  sendPasswordResetCode: (
    email: string,
  ) => Promise<{ ok: boolean; retryAfterSeconds?: number; message?: string; error?: string }>;
  resetPasswordWithCode: (
    email: string,
    code: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  setLanguage: (lng: 'en' | 'zh') => Promise<void>;
  changePassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  updateProfile: (patch: Partial<Pick<User, 'email' | 'phone'>>) => void;
  setSelectedStore: (storeId: string) => Promise<void>;
  /** 拉取 GET /api/v1/app/auth/me，更新员工信息与门店列表 */
  refreshCurrentEmployee: () => Promise<{ ok: boolean; message?: string }>;
  clockEvents: { id: string; type: 'in' | 'out'; at: string }[];
  /** @deprecated 请使用 punchShift；打卡 Tab 保留兼容 */
  punch: (type: 'in' | 'out') => void;
  shiftPunches: ShiftPunchRecord[];
  getShiftPunch: (
    workDate: string,
    slot: { id: string; range: string; areaName: string; shiftName: string },
  ) => ShiftPunchRecord | undefined;
  punchShift: (
    scheduleId: string,
    workDate: string,
    kind: 'in' | 'out',
  ) => Promise<{ ok: boolean; message?: string }>;
  /** GET /api/v1/app/clock/punches，刷新指定日期的班次打卡状态 */
  refreshShiftPunchesForDate: (workDate: string) => Promise<{ ok: boolean; message?: string }>;
  /** 指定日期的打卡记录是否已成功拉取（未拉取前 UI 不展示打卡状态提示） */
  isShiftPunchDateLoaded: (workDate: string) => boolean;
  publishedScheduleByDate: Record<string, MyPublishedShiftSlot[]>;
  mergePublishedSchedule: (byDate: Record<string, MyPublishedShiftSlot[]>) => void;
  requestScheduleContext: RequestScheduleContext | null;
  setRequestScheduleContext: (ctx: RequestScheduleContext | null) => void;
  myAttendanceRequests: LeaveRequest[];
  approvalAttendanceRequests: LeaveRequest[];
  /** 当前门店是否已有店长（me / 考勤列表下发） */
  selectedStoreHasStoreManager: boolean | null;
  refreshAttendanceRequests: () => Promise<{ ok: boolean; message?: string }>;
  submitAttendanceRequest: (
    input: SubmitAttendanceInput,
  ) => Promise<{ ok: boolean; message?: string }>;
  reviewAttendanceRequest: (
    id: string,
    approved: boolean,
    reviewComment?: string,
    substitutions?: import('../api/types').LeaveSubstitutionReviewItem[],
    fieldDispositions?: import('../api/types').FieldLeaveDispositionRequest[],
  ) => Promise<{ ok: boolean; message?: string }>;
  /** 撤回本人待审批申请 */
  cancelAttendanceRequest: (id: string) => Promise<{ ok: boolean; message?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [language, setLanguageState] = useState<'en' | 'zh'>('en');
  const [clockEvents, setClockEvents] = useState<{ id: string; type: 'in' | 'out'; at: string }[]>([]);
  const [shiftPunches, setShiftPunches] = useState<ShiftPunchRecord[]>([]);
  const [shiftPunchDatesLoaded, setShiftPunchDatesLoaded] = useState<Record<string, true>>({});
  const [publishedScheduleByDate, setPublishedScheduleByDate] = useState<
    Record<string, MyPublishedShiftSlot[]>
  >({});
  const [requestScheduleContext, setRequestScheduleContext] = useState<RequestScheduleContext | null>(
    null,
  );
  const [myAttendanceRequests, setMyAttendanceRequests] = useState<LeaveRequest[]>([]);
  const [approvalAttendanceRequests, setApprovalAttendanceRequests] = useState<LeaveRequest[]>([]);
  const [selectedStoreHasStoreManager, setSelectedStoreHasStoreManager] = useState<boolean | null>(
    null,
  );

  const accessTokenRef = useRef<string | null>(null);
  const languageRef = useRef<'en' | 'zh'>('en');
  /** 递增后可使进行中的冷启动恢复逻辑失效，避免与登录竞态覆盖 token */
  const authEpochRef = useRef(0);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    configureApiClient(
      () => accessTokenRef.current,
      () => languageRef.current,
    );
  }, []);

  const clearSessionLocally = useCallback(async () => {
    setClockEvents([]);
    setShiftPunches([]);
    setShiftPunchDatesLoaded({});
    setPublishedScheduleByDate({});
    setRequestScheduleContext(null);
    setMyAttendanceRequests([]);
    setApprovalAttendanceRequests([]);
    setSelectedStoreHasStoreManager(null);
    accessTokenRef.current = null;
    setAccessToken(null);
    setSession(null);
    resetServerClockState();
    await Promise.all([AsyncStorage.removeItem(AUTH_KEY), AsyncStorage.removeItem(TOKEN_KEY)]);
  }, []);

  const handleUnauthorized = useCallback(() => {
    showSessionExpiredAlert(() => {
      resetUnauthorizedGuard();
      resetSessionExpiredAlert();
      void clearSessionLocally();
    });
  }, [clearSessionLocally]);

  useEffect(() => {
    configureUnauthorizedHandler(handleUnauthorized);
  }, [handleUnauthorized]);

  useEffect(() => {
    setClockSkewWarningHandler((skewMs) => {
      const minutes = Math.max(1, Math.ceil(Math.abs(skewMs) / 60000));
      Alert.alert(
        i18n.t('deviceClockSkewTitle'),
        i18n.t('deviceClockSkewMessage', { minutes }),
        [{ text: i18n.t('deviceClockSkewOk') }],
      );
    });
    return () => {
      setClockSkewWarningHandler(null);
    };
  }, []);

  const persistAuth = useCallback(async (nextSession: Session | null, token: string | null) => {
    const normalizedToken = token?.trim() ? token.trim() : null;
    accessTokenRef.current = normalizedToken;
    setAccessToken(normalizedToken);
    setSession(nextSession);
    if (nextSession && normalizedToken) {
      await Promise.all([
        AsyncStorage.setItem(AUTH_KEY, JSON.stringify(nextSession)),
        AsyncStorage.setItem(TOKEN_KEY, normalizedToken),
      ]);
    } else {
      await Promise.all([AsyncStorage.removeItem(AUTH_KEY), AsyncStorage.removeItem(TOKEN_KEY)]);
    }
  }, []);

  const refreshSessionFromApi = useCallback(async (token: string, storeId?: string) => {
    accessTokenRef.current = token;
    setAccessToken(token);
    const emp = await fetchCurrentEmployee(storeId);
    const user = mapEmployeeToUser(emp);
    const next: Session = { user };
    setSession(next);
    await Promise.all([
      AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next)),
      AsyncStorage.setItem(TOKEN_KEY, token),
    ]);
    return next;
  }, []);

  useEffect(() => {
    const epoch = ++authEpochRef.current;
    let cancelled = false;
    const stale = () => cancelled || epoch !== authEpochRef.current;
    void (async () => {
      try {
        const [rawSession, rawToken, rawLang] = await Promise.all([
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(LANG_KEY),
        ]);
        if (stale()) return;
        if (rawLang === 'en' || rawLang === 'zh') {
          setLanguageState(rawLang);
          setAppLanguage(rawLang);
          languageRef.current = rawLang;
        }
        if (rawToken) {
          try {
            let bootStoreId: string | undefined;
            if (rawSession) {
              try {
                const parsed = JSON.parse(rawSession) as Session;
                bootStoreId = parsed.user?.selectedStoreId;
              } catch {
                bootStoreId = undefined;
              }
            }
            await refreshSessionFromApi(rawToken, bootStoreId);
          } catch (e) {
            if (stale()) return;
            if (e instanceof ApiError && e.code === 401) {
              showSessionExpiredAlert(() => {
                resetUnauthorizedGuard();
                resetSessionExpiredAlert();
                void clearSessionLocally();
              });
            } else if (rawSession) {
              const parsed = JSON.parse(rawSession) as Session;
              const u = migrateUser(parsed.user as User & { storeName?: string });
              await persistAuth({ user: u }, rawToken);
            } else {
              await persistAuth(null, null);
            }
          }
        } else if (rawSession) {
          // 仅有 session、无 token 会导致业务请求不带 Authorization
          await persistAuth(null, null);
        }
      } catch {
        // ignore corrupt storage
      } finally {
        if (!stale()) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistAuth, refreshSessionFromApi, clearSessionLocally]);

  const login = useCallback(
    async (account: string, password: string) => {
      const email = account.trim();
      if (!email || !password) {
        return { ok: false, error: 'empty' };
      }
      try {
        authEpochRef.current += 1;
        const result = await loginWithEmail(email, password);
        const token = pickAccessToken(result);
        if (!token) {
          return { ok: false, error: 'api', message: i18n.t('loginErrorInvalidResponse') };
        }
        const user = mapEmployeeToUser(result.user);
        resetUnauthorizedGuard();
        resetSessionExpiredAlert();
        await persistAuth({ user }, token);
        return { ok: true };
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message === API_INVALID_RESPONSE
              ? i18n.t('loginErrorInvalidResponse')
              : e.message
            : e instanceof TypeError
              ? i18n.t('loginErrorNetwork')
              : undefined;
        return { ok: false, error: 'api', message };
      }
    },
    [persistAuth],
  );

  const checkAccountStatus = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      return { ok: false, error: 'empty_email' as const };
    }
    try {
      const result = await lookupAccountByEmail({ email: trimmed });
      return { ok: true, status: result.status };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      return { ok: false, error: 'api' as const, message };
    }
  }, []);

  const logout = useCallback(async () => {
    if (accessTokenRef.current) {
      try {
        await logoutSession();
      } catch {
        // 本地仍清除会话
      }
    }
    resetUnauthorizedGuard();
    resetSessionExpiredAlert();
    resetServerClockState();
    setClockEvents([]);
    setShiftPunches([]);
    setShiftPunchDatesLoaded({});
    setPublishedScheduleByDate({});
    setRequestScheduleContext(null);
    setMyAttendanceRequests([]);
    setApprovalAttendanceRequests([]);
    setSelectedStoreHasStoreManager(null);
    await persistAuth(null, null);
  }, [persistAuth]);

  const sendActivationCodeToEmail = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      return { ok: false, error: 'empty_email' as const };
    }
    try {
      const result = await sendActivationCode({ email: trimmed });
      return {
        ok: true,
        retryAfterSeconds: result.retryAfterSeconds ?? 60,
      };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      if (e instanceof ApiError && e.code === 409) {
        return { ok: false, error: 'rate_limit' as const, retryAfterSeconds: 60, message };
      }
      return { ok: false, error: 'api' as const, message };
    }
  }, []);

  const activateAccount = useCallback(
    async (email: string, code: string, password: string) => {
      const trimmedEmail = email.trim();
      const trimmedCode = code.trim();
      if (!trimmedEmail) {
        return { ok: false, error: 'empty_email' };
      }
      if (!/^\d{4}$/.test(trimmedCode)) {
        return { ok: false, error: 'invalid_code' };
      }
      if (password.length < 8) {
        return { ok: false, error: 'invalid_password' };
      }
      try {
        authEpochRef.current += 1;
        const result = await activateEmployeeAccount({
          email: trimmedEmail,
          code: trimmedCode,
          password,
        });
        const token = pickAccessToken(result);
        if (!token) {
          return { ok: false, error: 'api', message: i18n.t('loginErrorInvalidResponse') };
        }
        const user = mapEmployeeToUser(result.user);
        resetUnauthorizedGuard();
        resetSessionExpiredAlert();
        await persistAuth({ user }, token);
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : undefined;
        return { ok: false, error: 'api', message };
      }
    },
    [persistAuth],
  );

  const sendPasswordResetCodeToEmail = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      return { ok: false, error: 'empty_email' as const };
    }
    try {
      const result = await sendPasswordResetCode({ email: trimmed });
      return {
        ok: true,
        retryAfterSeconds: result.retryAfterSeconds ?? 60,
      };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      if (e instanceof ApiError && e.code === 409) {
        return { ok: false, error: 'rate_limit' as const, retryAfterSeconds: 60, message };
      }
      return { ok: false, error: 'api' as const, message };
    }
  }, []);

  const resetPasswordWithCode = useCallback(async (email: string, code: string, password: string) => {
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail) {
      return { ok: false, error: 'empty_email' };
    }
    if (!/^\d{4}$/.test(trimmedCode)) {
      return { ok: false, error: 'invalid_code' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'invalid_password' };
    }
    try {
      await confirmPasswordReset({
        email: trimmedEmail,
        code: trimmedCode,
        password,
      });
      return { ok: true };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      return { ok: false, error: 'api', message };
    }
  }, []);

  const setLanguage = useCallback(async (lng: 'en' | 'zh') => {
    setLanguageState(lng);
    languageRef.current = lng;
    setAppLanguage(lng);
    await AsyncStorage.setItem(LANG_KEY, lng);
  }, []);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (!oldPassword?.trim() || !newPassword?.trim()) {
        return { ok: false, error: 'empty' };
      }
      const storeId =
        session?.user.selectedStoreId ?? session?.user.stores[0]?.id;
      if (!storeId) {
        return { ok: false, error: 'api', message: i18n.t('passwordChangeFailed') };
      }
      try {
        await changeEmployeePassword(
          {
            currentPassword: oldPassword.trim(),
            newPassword: newPassword.trim(),
          },
          storeId,
        );
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : undefined;
        return { ok: false, error: 'api', message };
      }
    },
    [session?.user.selectedStoreId, session?.user.stores],
  );

  const updateProfile = useCallback((patch: Partial<Pick<User, 'email' | 'phone'>>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = { user: { ...prev.user, ...patch } };
      void AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshCurrentEmployee = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) {
      return { ok: false, message: 'Not signed in' };
    }
    try {
      const prevSelected = session?.user.selectedStoreId;
      accessTokenRef.current = token;
      const emp = await fetchCurrentEmployee(prevSelected);
      let user = mapEmployeeToUser(emp);
      if (prevSelected && user.stores.some((s) => s.id === prevSelected)) {
        user = { ...user, selectedStoreId: prevSelected };
      }
      const next: Session = { user };
      setSession(next);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
      return { ok: true };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      return { ok: false, message };
    }
  }, [session?.user.selectedStoreId]);

  const setSelectedStore = useCallback(
    async (storeId: string) => {
      const prev = session;
      if (!prev) return;
      if (!prev.user.stores.some((s) => s.id === storeId)) return;
      if (prev.user.selectedStoreId === storeId) return;

      const numericId = Number(storeId);
      if (!Number.isFinite(numericId) || !accessTokenRef.current) return;

      try {
        await updateLastStore(numericId);
        const emp = await fetchCurrentEmployee(storeId);
        const user = mapEmployeeToUser(emp);
        const next: Session = { user: { ...user, selectedStoreId: storeId } };
        setSession(next);
        setShiftPunches([]);
        setShiftPunchDatesLoaded({});
        setMyAttendanceRequests([]);
        setApprovalAttendanceRequests([]);
        setSelectedStoreHasStoreManager(null);
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(next));
      } catch {
        // 切店失败时保留原门店，避免 401 竞态导致误登出
      }
    },
    [session],
  );

  const getShiftPunch = useCallback(
    (
      workDate: string,
      slot: { id: string; range: string; areaName: string; shiftName: string },
    ) => {
      const target = shiftMatchTargetFromSlot(workDate, slot);
      const matches = shiftPunches.filter((p) => punchRecordMatchesTarget(p, target));
      if (matches.length === 0) return undefined;
      if (matches.length === 1) return matches[0];
      return matches.reduce(
        (merged, r) => ({
          ...merged,
          scheduleId: merged.scheduleId || r.scheduleId,
          shiftKey: merged.shiftKey || r.shiftKey,
          scheduledRange: merged.scheduledRange || r.scheduledRange,
          clockInAt: merged.clockInAt || r.clockInAt,
          clockOutAt: merged.clockOutAt || r.clockOutAt,
        }),
        matches[0],
      );
    },
    [shiftPunches],
  );

  const mergeShiftPunchesForDate = useCallback((workDate: string, records: ShiftPunchRecord[]) => {
    setShiftPunches((prev) => {
      const rest = prev.filter((p) => p.workDate !== workDate);
      const kept = prev.filter((p) => p.workDate === workDate);
      return [...rest, ...consolidateShiftPunchRecords([...kept, ...records])];
    });
  }, []);

  const isShiftPunchDateLoaded = useCallback(
    (workDate: string) => !!shiftPunchDatesLoaded[workDate],
    [shiftPunchDatesLoaded],
  );

  const refreshShiftPunchesForDate = useCallback(
    async (workDate: string): Promise<{ ok: boolean; message?: string }> => {
      const storeId = session?.user.selectedStoreId;
      if (!storeId || !workDate.trim()) {
        return { ok: false };
      }
      try {
        const data = await fetchClockPunchesByDay({ storeId, date: workDate });
        const records = mapPunchesByPublishedCell(data.punches ?? [], workDate);
        mergeShiftPunchesForDate(workDate, records);
        setShiftPunchDatesLoaded((prev) => ({ ...prev, [workDate]: true }));
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : undefined;
        return { ok: false, message };
      }
    },
    [session?.user.selectedStoreId, mergeShiftPunchesForDate],
  );

  const punchShift = useCallback(
    async (
      scheduleId: string,
      workDate: string,
      kind: 'in' | 'out',
    ): Promise<{ ok: boolean; message?: string }> => {
      const storeId = session?.user.selectedStoreId;
      if (!storeId) {
        return { ok: false, message: i18n.t('punchErrorNoStore') };
      }

      const cellId = Number(scheduleId);
      if (!Number.isFinite(cellId) || cellId <= 0) {
        return { ok: false, message: i18n.t('punchErrorInvalidCell') };
      }

      const perm = await ensureLocationPermissionForPunch();
      if (!perm.granted) {
        return { ok: false, message: perm.message };
      }

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { deviceType, deviceId } = getPunchDevicePayload();

        const data = await postClockPunch({
          storeId,
          body: {
            publishedCellId: cellId,
            punchType: kind === 'in' ? 'clock_in' : 'clock_out',
            deviceType,
            deviceId,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          },
        });

        const at = data.punchedAt || new Date().toISOString();
        syncServerTimeFromMillis(new Date(at).getTime());
        setShiftPunches((prev) =>
          consolidateShiftPunchRecords(applyClockPunchResult(prev, data, workDate)),
        );
        await refreshShiftPunchesForDate(workDate);
        setClockEvents((prev) => [...prev, { id: `${scheduleId}-${kind}-${at}`, type: kind, at }]);

        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : i18n.t('punchFailed');
        return { ok: false, message };
      }
    },
    [session?.user.selectedStoreId, refreshShiftPunchesForDate],
  );

  const punch = useCallback((type: 'in' | 'out') => {
    const at = new Date().toISOString();
    setClockEvents((prev) => [...prev, { id: `${type}-${at}`, type, at }]);
  }, []);

  const mergePublishedSchedule = useCallback((byDate: Record<string, MyPublishedShiftSlot[]>) => {
    setPublishedScheduleByDate((prev) => ({ ...prev, ...byDate }));
  }, []);

  const refreshAttendanceRequests = useCallback(async (): Promise<{
    ok: boolean;
    message?: string;
  }> => {
    const storeId = session?.user.selectedStoreId;
    const user = session?.user;
    if (!storeId || !user) {
      setMyAttendanceRequests([]);
      setApprovalAttendanceRequests([]);
      setSelectedStoreHasStoreManager(null);
      return { ok: false };
    }
    try {
      const storeRef = user.stores.find((s) => s.id === storeId);
      let storeHasManager: boolean | null = storeRef?.hasStoreManager ?? null;

      const myData = await fetchMyAttendanceRequests(storeId);
      if (myData.storeHasStoreManager != null) {
        storeHasManager = myData.storeHasStoreManager;
      } else if (myData.store_has_store_manager != null) {
        storeHasManager = myData.store_has_store_manager;
      }
      const mine = (myData.requests ?? []).map((row) => {
        const req = mapAttendanceRequestToLeaveRequest(row, {
          applicantId: user.id,
          applicantName: user.name,
        });
        return {
          ...req,
          shifts: enrichShiftBindingsFromSchedule(req.shifts, publishedScheduleByDate),
        };
      });
      setMyAttendanceRequests(mine);

      const isManager = user.storeManagerStoreIds.includes(storeId);
      const isDeputy = user.deputyManagerStoreIds.includes(storeId);
      if (isManager || isDeputy) {
        const approvalData = await fetchPendingApprovalAttendanceRequests(storeId);
        if (approvalData.storeHasStoreManager != null) {
          storeHasManager = approvalData.storeHasStoreManager;
        } else if (approvalData.store_has_store_manager != null) {
          storeHasManager = approvalData.store_has_store_manager;
        }
        const approvals = (approvalData.requests ?? []).map((row) => {
          const req = mapAttendanceRequestToLeaveRequest(row);
          return {
            ...req,
            shifts: enrichShiftBindingsFromSchedule(req.shifts, publishedScheduleByDate),
          };
        });
        setApprovalAttendanceRequests(approvals);
      } else {
        setApprovalAttendanceRequests([]);
      }
      setSelectedStoreHasStoreManager(storeHasManager);
      return { ok: true };
    } catch (e) {
      const message = e instanceof ApiError ? e.message : undefined;
      return { ok: false, message };
    }
  }, [session?.user, publishedScheduleByDate]);

  const submitAttendanceRequest = useCallback(
    async (input: SubmitAttendanceInput): Promise<{ ok: boolean; message?: string }> => {
      const storeId = session?.user.selectedStoreId;
      if (!storeId) {
        return { ok: false, message: i18n.t('punchErrorNoStore') };
      }
      try {
        const body = buildAttendanceCreateBody(input);
        await createAttendanceRequest(storeId, body);
        await refreshAttendanceRequests();
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : i18n.t('requestSubmitFailed');
        return { ok: false, message };
      }
    },
    [session?.user.selectedStoreId, refreshAttendanceRequests],
  );

  const reviewAttendanceRequest = useCallback(
    async (
      id: string,
      approved: boolean,
      reviewComment?: string,
      substitutions?: import('../api/types').LeaveSubstitutionReviewItem[],
      fieldDispositions?: import('../api/types').FieldLeaveDispositionRequest[],
    ): Promise<{ ok: boolean; message?: string }> => {
      const storeId = session?.user.selectedStoreId;
      if (!storeId) {
        return { ok: false, message: i18n.t('punchErrorNoStore') };
      }
      try {
        const trimmed = reviewComment?.trim();
        if (!trimmed) {
          return { ok: false, message: i18n.t('requestReviewCommentRequired') };
        }
        await reviewAttendanceRequestApi(storeId, id, {
          approved,
          reviewComment: trimmed,
          substitutions: substitutions?.length ? substitutions : undefined,
          fieldDispositions: fieldDispositions?.length ? fieldDispositions : undefined,
        });
        await refreshAttendanceRequests();
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : i18n.t('requestReviewFailed');
        return { ok: false, message };
      }
    },
    [session?.user.selectedStoreId, refreshAttendanceRequests],
  );

  const cancelAttendanceRequest = useCallback(
    async (id: string): Promise<{ ok: boolean; message?: string }> => {
      const storeId = session?.user.selectedStoreId;
      if (!storeId) {
        return { ok: false, message: i18n.t('punchErrorNoStore') };
      }
      try {
        await cancelAttendanceRequestApi(storeId, id);
        await refreshAttendanceRequests();
        return { ok: true };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : i18n.t('requestCancelFailed');
        return { ok: false, message };
      }
    },
    [session?.user.selectedStoreId, refreshAttendanceRequests],
  );

  const value = useMemo(
    () => ({
      ready,
      session,
      language,
      login,
      checkAccountStatus,
      logout,
      sendActivationCode: sendActivationCodeToEmail,
      activateAccount,
      sendPasswordResetCode: sendPasswordResetCodeToEmail,
      resetPasswordWithCode,
      setLanguage,
      changePassword,
      updateProfile,
      setSelectedStore,
      refreshCurrentEmployee,
      clockEvents,
      punch,
      shiftPunches,
      getShiftPunch,
      punchShift,
      refreshShiftPunchesForDate,
      isShiftPunchDateLoaded,
      publishedScheduleByDate,
      mergePublishedSchedule,
      requestScheduleContext,
      setRequestScheduleContext,
      myAttendanceRequests,
      approvalAttendanceRequests,
      selectedStoreHasStoreManager,
      refreshAttendanceRequests,
      submitAttendanceRequest,
      reviewAttendanceRequest,
      cancelAttendanceRequest,
    }),
    [
      ready,
      session,
      language,
      login,
      checkAccountStatus,
      logout,
      sendActivationCodeToEmail,
      activateAccount,
      sendPasswordResetCodeToEmail,
      resetPasswordWithCode,
      setLanguage,
      changePassword,
      updateProfile,
      setSelectedStore,
      refreshCurrentEmployee,
      clockEvents,
      punch,
      shiftPunches,
      getShiftPunch,
      punchShift,
      refreshShiftPunchesForDate,
      isShiftPunchDateLoaded,
      publishedScheduleByDate,
      mergePublishedSchedule,
      requestScheduleContext,
      setRequestScheduleContext,
      myAttendanceRequests,
      approvalAttendanceRequests,
      selectedStoreHasStoreManager,
      refreshAttendanceRequests,
      submitAttendanceRequest,
      reviewAttendanceRequest,
      cancelAttendanceRequest,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
