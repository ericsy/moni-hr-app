import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  groupPublishedScheduleByDate,
  type MyPublishedShiftSlot,
} from '../../src/api/mapPublishedSchedule';
import { normalizeSubmitReason } from '../../src/api/mapAttendanceRequest';
import { fetchMyPublishedSchedule } from '../../src/api/schedule';
import { TimeSelectField } from '../../src/components/TimeSelectField';
import { CalendarDatePickerModal } from '../../src/components/CalendarDatePickerModal';
import type { LeaveRequest } from '../../src/context/AuthContext';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { calendarDateKey, normalizeDateKeyOrToday } from '../../src/utils/calendarDateKey';
import { formatPunchHeaderDate } from '../../src/utils/formatPunchTime';
import {
  getShiftLeaveBlockReason,
  hasOpenLeaveForShift,
  isFullLeaveBlockedForShift,
  isMissedPunchBlockedByLeave,
} from '../../src/utils/leaveRequestEligibility';
import {
  findOpenMissedPunchRequest,
  isShiftLeaveBlockedByMissedPunch,
} from '../../src/utils/missedPunchEligibility';
import {
  addDaysLocal,
  compareDateKeys,
  compareHm,
  defaultPartialFromShiftRange,
  hmFromShiftRange,
  parseDateKey,
  parseScheduledHmRange,
  startOfWeekMondayLocal,
} from '../../src/utils/localDateTime';
import {
  buildShiftBinding,
  findSlotForSelectionKey,
  parseShiftSelectionKey,
  shiftSelectionKeyFromBinding,
  shiftSelectionKeyFromSlot,
} from '../../src/utils/requestShiftBinding';
import { weekNavigatorLabels } from '../../src/utils/localeDateFormat';
import { getApproximateServerNowDate } from '../../src/utils/serverClock';
import { canApplyMissedPunchKind } from '../../src/utils/shiftClockWindow';

function sanitizeRouteParam(value?: string | string[] | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim();
}
import {
  doesPunchCoverScheduledShift,
  formatShiftPunchLine,
} from '../../src/utils/shiftLeaveEligibility';

function buildShiftsFromSelection(
  keys: Record<string, true>,
  scheduleByDate: Record<string, MyPublishedShiftSlot[]>,
) {
  const out = [];
  for (const key of Object.keys(keys)) {
    const found = findSlotForSelectionKey(scheduleByDate, key);
    if (!found) continue;
    out.push(buildShiftBinding(found.workDate, found.slotIndex, found.slot));
  }
  out.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.scheduledRange.localeCompare(b.scheduledRange),
  );
  return out;
}

type RequestCreateParams = {
  type?: string;
  workDate?: string;
  slotIndex?: string;
  punchKind?: string;
  range?: string;
};

export default function RequestCreateScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<RequestCreateParams>();
  const {
    session,
    language,
    submitAttendanceRequest,
    myAttendanceRequests,
    refreshAttendanceRequests,
    requestScheduleContext,
    setRequestScheduleContext,
    publishedScheduleByDate,
    mergePublishedSchedule,
    getShiftPunch,
    refreshShiftPunchesForDate,
    shiftPunches,
  } = useAuth();
  const [submitBusy, setSubmitBusy] = useState(false);
  const [type, setType] = useState<LeaveRequest['type']>(() =>
    params.type === 'missed_punch' ? 'missed_punch' : 'leave',
  );
  const [reason, setReason] = useState('');

  const [workDate, setWorkDate] = useState(() => calendarDateKey(getApproximateServerNowDate()));
  const [slotIndex, setSlotIndex] = useState(0);
  const [punchKind, setPunchKind] = useState<'in' | 'out'>('in');
  const [proposedTime, setProposedTime] = useState('09:00');

  const [leaveWeekStart, setLeaveWeekStart] = useState(() =>
    startOfWeekMondayLocal(getApproximateServerNowDate()),
  );
  const [leaveFocusDay, setLeaveFocusDay] = useState(() => calendarDateKey(getApproximateServerNowDate()));
  const [leaveScheduleLoading, setLeaveScheduleLoading] = useState(false);
  const [selectedShiftKeys, setSelectedShiftKeys] = useState<Record<string, true>>({});
  /** 每班次请假范围：key = workDate|scheduleId */
  const [leaveScopeByKey, setLeaveScopeByKey] = useState<Record<string, 'full' | 'partial'>>({});
  const [partialLeaveByKey, setPartialLeaveByKey] = useState<
    Record<string, { from: string; to: string }>
  >({});
  const [leaveWindowStartIso, setLeaveWindowStartIso] = useState(() =>
    calendarDateKey(startOfWeekMondayLocal(getApproximateServerNowDate())),
  );
  const [leaveWindowEndIso, setLeaveWindowEndIso] = useState(() =>
    calendarDateKey(addDaysLocal(startOfWeekMondayLocal(getApproximateServerNowDate()), 6)),
  );
  const [leaveCalendarOpen, setLeaveCalendarOpen] = useState<'start' | 'end' | null>(null);
  /** 提交成功准备跳转时关闭时间滚轮，避免 Android Modal 与页面卸载竞态 */
  const [leavePickersEnabled, setLeavePickersEnabled] = useState(true);
  const closingAfterSubmitRef = useRef(false);

  const selectedStoreId = session?.user?.selectedStoreId ?? '';

  const daySlots = useMemo(() => requestScheduleContext?.slots ?? [], [requestScheduleContext]);
  const selectedSlot = daySlots[slotIndex];
  const todayIso = calendarDateKey(getApproximateServerNowDate());
  const normalizedWorkDate = normalizeDateKeyOrToday(workDate, getApproximateServerNowDate());

  const selectedPunch = useMemo(
    () => (selectedSlot ? getShiftPunch(normalizedWorkDate, selectedSlot) : undefined),
    [getShiftPunch, selectedSlot, normalizedWorkDate],
  );
  const selectedPairPunch = useMemo(() => {
    if (selectedSlot?.overnightRole !== 'end' || !selectedSlot.overnightPairCellId) return undefined;
    return shiftPunches.find((p) => p.scheduleId === selectedSlot.overnightPairCellId);
  }, [selectedSlot, shiftPunches]);

  const missedPunchWheelAnchor = useMemo(() => {
    if (!selectedSlot) return '09:00';
    return hmFromShiftRange(selectedSlot.range, punchKind === 'out' ? 'end' : 'start');
  }, [selectedSlot, punchKind]);

  const blockingMissedPunchLeave = useMemo(() => {
    if (type !== 'missed_punch' || !selectedSlot) return false;
    return isMissedPunchBlockedByLeave(myAttendanceRequests, normalizedWorkDate, selectedSlot);
  }, [type, myAttendanceRequests, normalizedWorkDate, selectedSlot]);

  const blockingMissedPunchDuplicate = useMemo(() => {
    if (type !== 'missed_punch' || !selectedSlot) return undefined;
    return findOpenMissedPunchRequest(
      myAttendanceRequests,
      normalizedWorkDate,
      selectedSlot,
      punchKind,
    );
  }, [type, myAttendanceRequests, normalizedWorkDate, selectedSlot, punchKind]);

  const blockingMissedPunchTooEarly = useMemo(() => {
    if (type !== 'missed_punch' || !selectedSlot) return false;
    const now = getApproximateServerNowDate();
    return !canApplyMissedPunchKind(
      normalizedWorkDate,
      selectedSlot.range,
      selectedPunch,
      todayIso,
      punchKind,
      now,
      selectedSlot.overnightRole ?? 'normal',
      selectedPairPunch,
    );
  }, [
    type,
    normalizedWorkDate,
    selectedSlot,
    selectedPunch,
    todayIso,
    punchKind,
    selectedPairPunch,
  ]);

  const missedPunchInTooEarly = useMemo(() => {
    if (type !== 'missed_punch' || !selectedSlot || selectedSlot.overnightRole === 'end') return false;
    return !canApplyMissedPunchKind(
      normalizedWorkDate,
      selectedSlot.range,
      selectedPunch,
      todayIso,
      'in',
      getApproximateServerNowDate(),
      selectedSlot.overnightRole ?? 'normal',
      selectedPairPunch,
    );
  }, [type, normalizedWorkDate, selectedSlot, selectedPunch, todayIso, selectedPairPunch]);

  const missedPunchOutTooEarly = useMemo(() => {
    if (type !== 'missed_punch' || !selectedSlot || selectedSlot.overnightRole === 'start') return false;
    return !canApplyMissedPunchKind(
      normalizedWorkDate,
      selectedSlot.range,
      selectedPunch,
      todayIso,
      'out',
      getApproximateServerNowDate(),
      selectedSlot.overnightRole ?? 'normal',
      selectedPairPunch,
    );
  }, [type, normalizedWorkDate, selectedSlot, selectedPunch, todayIso, selectedPairPunch]);

  const blockingMissedPunch =
    blockingMissedPunchLeave || !!blockingMissedPunchDuplicate || blockingMissedPunchTooEarly;

  useFocusEffect(
    useCallback(() => {
      closingAfterSubmitRef.current = false;
      setLeavePickersEnabled(true);
      void refreshAttendanceRequests();
      return () => {
        // 离开页后再清 context，避免提交成功时先清空触发 applyRouteParams 与 Modal 卸载竞态（Android 13 闪退）
        const clear = () => setRequestScheduleContext(null);
        if (Platform.OS === 'android') {
          setTimeout(clear, 0);
        } else {
          clear();
        }
      };
    }, [refreshAttendanceRequests, setRequestScheduleContext]),
  );

  useEffect(() => {
    if (type !== 'missed_punch' || !selectedSlot) return;
    setProposedTime(missedPunchWheelAnchor);
  }, [type, missedPunchWheelAnchor, selectedSlot?.id, punchKind]);

  useEffect(() => {
    if (selectedSlot?.overnightRole === 'start') setPunchKind('in');
    if (selectedSlot?.overnightRole === 'end') setPunchKind('out');
  }, [selectedSlot?.id, selectedSlot?.overnightRole]);

  const leaveWeekStartIso = useMemo(() => calendarDateKey(leaveWeekStart), [leaveWeekStart]);

  const leaveWindowLowHigh = useMemo(() => {
    const lo =
      compareDateKeys(leaveWindowStartIso, leaveWindowEndIso) <= 0
        ? leaveWindowStartIso
        : leaveWindowEndIso;
    const hi =
      compareDateKeys(leaveWindowStartIso, leaveWindowEndIso) <= 0
        ? leaveWindowEndIso
        : leaveWindowStartIso;
    return { lo, hi };
  }, [leaveWindowStartIso, leaveWindowEndIso]);

  const leaveScheduleFetchFromIso = useMemo(
    () => calendarDateKey(startOfWeekMondayLocal(parseDateKey(leaveWindowLowHigh.lo))),
    [leaveWindowLowHigh.lo],
  );
  const leaveScheduleFetchToIso = useMemo(
    () =>
      calendarDateKey(addDaysLocal(startOfWeekMondayLocal(parseDateKey(leaveWindowLowHigh.hi)), 6)),
    [leaveWindowLowHigh.hi],
  );

  const leaveWeekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDaysLocal(leaveWeekStart, i);
      return { iso: calendarDateKey(d), date: d };
    });
  }, [leaveWeekStart]);

  const applyLeaveWindowDate = useCallback(
    (which: 'start' | 'end', iso: string) => {
      if (which === 'start') {
        setLeaveWindowStartIso(iso);
        if (compareDateKeys(iso, leaveWindowEndIso) > 0) setLeaveWindowEndIso(iso);
      } else {
        setLeaveWindowEndIso(iso);
        if (compareDateKeys(iso, leaveWindowStartIso) < 0) setLeaveWindowStartIso(iso);
      }
    },
    [leaveWindowEndIso, leaveWindowStartIso],
  );

  const goPrevLeaveWeekNav = useCallback(() => {
    const next = addDaysLocal(leaveWeekStart, -7);
    const firstMon = startOfWeekMondayLocal(parseDateKey(leaveWindowLowHigh.lo));
    if (next.getTime() < firstMon.getTime()) return;
    setLeaveWeekStart(next);
    setLeaveFocusDay(calendarDateKey(next));
  }, [leaveWeekStart, leaveWindowLowHigh.lo]);

  const goNextLeaveWeekNav = useCallback(() => {
    const next = addDaysLocal(leaveWeekStart, 7);
    const lastMon = startOfWeekMondayLocal(parseDateKey(leaveWindowLowHigh.hi));
    if (next.getTime() > lastMon.getTime()) return;
    setLeaveWeekStart(next);
    setLeaveFocusDay(calendarDateKey(next));
  }, [leaveWeekStart, leaveWindowLowHigh.hi]);

  const weekdayAbbr = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  const selectedLeaveCount = Object.keys(selectedShiftKeys).length;

  const selectedLeaveShifts = useMemo(
    () => buildShiftsFromSelection(selectedShiftKeys, publishedScheduleByDate),
    [selectedShiftKeys, publishedScheduleByDate],
  );

  const focusedSlots = useMemo(
    () => publishedScheduleByDate[leaveFocusDay] ?? [],
    [publishedScheduleByDate, leaveFocusDay],
  );

  const resolveSlotRange = useCallback(
    (key: string): string | null => {
      const found = findSlotForSelectionKey(publishedScheduleByDate, key);
      return found?.slot.range ?? null;
    },
    [publishedScheduleByDate],
  );

  useEffect(() => {
    if (type !== 'leave') return;
    setLeaveScopeByKey((prev) => {
      const next: Record<string, 'full' | 'partial'> = {};
      for (const key of Object.keys(selectedShiftKeys)) {
        next[key] = prev[key] ?? 'full';
      }
      const changed =
        Object.keys(prev).length !== Object.keys(next).length ||
        Object.keys(next).some((k) => prev[k] !== next[k]);
      return changed ? next : prev;
    });
    setPartialLeaveByKey((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!selectedShiftKeys[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [type, selectedShiftKeys]);

  /** 已选「部分时段」但尚未写入时间时，用班次起止补全（不覆盖已有设置） */
  useEffect(() => {
    if (type !== 'leave') return;
    setPartialLeaveByKey((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(selectedShiftKeys)) {
        if ((leaveScopeByKey[key] ?? 'full') !== 'partial' || next[key]) continue;
        const range = resolveSlotRange(key);
        if (!range) continue;
        const def = defaultPartialFromShiftRange(range);
        if (def) {
          next[key] = def;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [type, selectedShiftKeys, leaveScopeByKey, resolveSlotRange]);

  const leavePartialValid = useMemo(() => {
    if (type !== 'leave') return true;
    for (const shift of selectedLeaveShifts) {
      const key = shiftSelectionKeyFromBinding(shift);
      if ((leaveScopeByKey[key] ?? 'full') !== 'partial') continue;
      const bounds = parseScheduledHmRange(shift.scheduledRange);
      const p = partialLeaveByKey[key];
      if (!bounds || !p) return false;
      if (compareHm(p.from, p.to) >= 0) return false;
      if (compareHm(p.from, bounds.start) < 0) return false;
      if (compareHm(p.to, bounds.end) > 0) return false;
    }
    return true;
  }, [type, selectedLeaveShifts, leaveScopeByKey, partialLeaveByKey]);

  const dateLang = language ?? i18n.language;
  const leaveWeekNav = useMemo(
    () => weekNavigatorLabels(leaveWeekStart, dateLang),
    [leaveWeekStart, dateLang],
  );

  const countSelectedOnDay = useCallback(
    (iso: string) =>
      Object.keys(selectedShiftKeys).filter((k) => parseShiftSelectionKey(k)?.workDate === iso)
        .length,
    [selectedShiftKeys],
  );

  const getLeaveBlockReason = useCallback(
    (slot: MyPublishedShiftSlot, workDate: string) =>
      getShiftLeaveBlockReason(
        myAttendanceRequests,
        workDate,
        slot,
        slot.range,
        doesPunchCoverScheduledShift(getShiftPunch(workDate, slot), slot.range),
        isShiftLeaveBlockedByMissedPunch(myAttendanceRequests, workDate, slot, slot.range),
      ),
    [getShiftPunch, myAttendanceRequests],
  );

  const isShiftLeaveBlocked = useCallback(
    (slot: MyPublishedShiftSlot, workDate: string) =>
      getLeaveBlockReason(slot, workDate) !== 'none',
    [getLeaveBlockReason],
  );

  const isFullLeaveBlocked = useCallback(
    (slot: MyPublishedShiftSlot, workDate: string) =>
      isFullLeaveBlockedForShift(myAttendanceRequests, workDate, slot, getShiftPunch(workDate, slot)),
    [getShiftPunch, myAttendanceRequests],
  );

  const leaveBlockAlertMessage = useCallback(
    (reason: ReturnType<typeof getLeaveBlockReason>) => {
      if (reason === 'leave_pending') return t('leaveShiftAlreadyPending');
      return t('leaveShiftPunchCovered');
    },
    [t],
  );

  const loadLeaveWeekSchedule = useCallback(async () => {
    if (!selectedStoreId) return;
    setLeaveScheduleLoading(true);
    try {
      const data = await fetchMyPublishedSchedule({
        storeId: selectedStoreId,
        from: leaveScheduleFetchFromIso,
        to: leaveScheduleFetchToIso,
      });
      mergePublishedSchedule(groupPublishedScheduleByDate(data.items ?? []));
      const punchDays: string[] = [];
      let d = parseDateKey(leaveScheduleFetchFromIso);
      const endD = parseDateKey(leaveScheduleFetchToIso);
      while (d.getTime() <= endD.getTime()) {
        punchDays.push(calendarDateKey(d));
        d = addDaysLocal(d, 1);
      }
      await Promise.all(punchDays.map((iso) => refreshShiftPunchesForDate(iso)));
    } finally {
      setLeaveScheduleLoading(false);
    }
  }, [
    selectedStoreId,
    leaveScheduleFetchFromIso,
    leaveScheduleFetchToIso,
    mergePublishedSchedule,
    refreshShiftPunchesForDate,
  ]);

  useEffect(() => {
    if (type !== 'leave' || !selectedStoreId) return;
    void loadLeaveWeekSchedule();
  }, [type, selectedStoreId, loadLeaveWeekSchedule]);

  useEffect(() => {
    if (type !== 'leave') return;
    const { lo, hi } = leaveWindowLowHigh;
    const firstMon = startOfWeekMondayLocal(parseDateKey(lo));
    const lastMon = startOfWeekMondayLocal(parseDateKey(hi));
    setLeaveWeekStart((prev) => {
      if (prev.getTime() < firstMon.getTime()) return firstMon;
      if (prev.getTime() > lastMon.getTime()) return lastMon;
      return prev;
    });
    setLeaveFocusDay((fd) => {
      if (compareDateKeys(fd, lo) < 0) return lo;
      if (compareDateKeys(fd, hi) > 0) return hi;
      return fd;
    });
  }, [type, leaveWindowLowHigh]);

  useEffect(() => {
    if (type !== 'leave') return;
    const { lo, hi } = leaveWindowLowHigh;
    setSelectedShiftKeys((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const wd = parseShiftSelectionKey(key)?.workDate;
        if (!wd || compareDateKeys(wd, lo) < 0 || compareDateKeys(wd, hi) > 0) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [type, leaveWindowLowHigh]);

  const refreshPageData = useCallback(async () => {
    await refreshAttendanceRequests();
    if (type === 'leave') {
      await loadLeaveWeekSchedule();
    } else if (type === 'missed_punch' && workDate) {
      await refreshShiftPunchesForDate(workDate);
    }
  }, [
    type,
    workDate,
    refreshAttendanceRequests,
    loadLeaveWeekSchedule,
    refreshShiftPunchesForDate,
  ]);

  useRefreshOnAppForeground(refreshPageData);

  /** 周切换后排班 key 失效会导致已选 1 段但无法解析，顺带清理 */
  useEffect(() => {
    if (type !== 'leave' || leaveScheduleLoading) return;
    setSelectedShiftKeys((prev) => {
      let changed = false;
      const next: Record<string, true> = {};
      for (const key of Object.keys(prev)) {
        const parsed = parseShiftSelectionKey(key);
        if (!parsed) {
          changed = true;
          continue;
        }
        const slots = publishedScheduleByDate[parsed.workDate] ?? [];
        if (!findSlotForSelectionKey(publishedScheduleByDate, key)) {
          changed = true;
          continue;
        }
        next[key] = true;
      }
      return changed ? next : prev;
    });
  }, [type, publishedScheduleByDate, leaveScheduleLoading]);

  /** 打卡数据加载后，取消已选但已打满卡的班次 */
  useEffect(() => {
    if (type !== 'leave') return;
    setSelectedShiftKeys((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const parsed = parseShiftSelectionKey(key);
        if (!parsed) continue;
        const found = findSlotForSelectionKey(publishedScheduleByDate, key);
        if (found && isShiftLeaveBlocked(found.slot, found.workDate)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [type, publishedScheduleByDate, shiftPunches, isShiftLeaveBlocked]);

  /** 打卡/漏打卡变化后，已选班次若不可整段请假则自动改为部分时段 */
  useEffect(() => {
    if (type !== 'leave') return;
    setLeaveScopeByKey((prev) => {
      let scopeChanged = false;
      const nextScope = { ...prev };
      for (const key of Object.keys(selectedShiftKeys)) {
        if ((prev[key] ?? 'full') !== 'full') continue;
        const parsed = parseShiftSelectionKey(key);
        if (!parsed) continue;
        const found = findSlotForSelectionKey(publishedScheduleByDate, key);
        if (!found || !isFullLeaveBlocked(found.slot, found.workDate)) continue;
        nextScope[key] = 'partial';
        scopeChanged = true;
      }
      return scopeChanged ? nextScope : prev;
    });
    setPartialLeaveByKey((prev) => {
      let partialChanged = false;
      const nextPartial = { ...prev };
      for (const key of Object.keys(selectedShiftKeys)) {
        const parsed = parseShiftSelectionKey(key);
        if (!parsed || prev[key]) continue;
        const found = findSlotForSelectionKey(publishedScheduleByDate, key);
        if (!found || !isFullLeaveBlocked(found.slot, found.workDate)) continue;
        const def = defaultPartialFromShiftRange(found.slot.range);
        if (!def) continue;
        nextPartial[key] = def;
        partialChanged = true;
      }
      return partialChanged ? nextPartial : prev;
    });
  }, [type, selectedShiftKeys, publishedScheduleByDate, isFullLeaveBlocked]);

  const updatePartialLeave = useCallback(
    (key: string, patch: Partial<{ from: string; to: string }>) => {
      setPartialLeaveByKey((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        return { ...prev, [key]: { ...cur, ...patch } };
      });
    },
    [],
  );

  const setShiftLeaveScope = useCallback(
    (key: string, mode: 'full' | 'partial', slot: MyPublishedShiftSlot, workDate: string) => {
      if (mode === 'full' && isFullLeaveBlocked(slot, workDate)) {
        Alert.alert(t('typeLeave'), t('leaveFullShiftBlocked'));
        return;
      }
      setLeaveScopeByKey((prev) => ({ ...prev, [key]: mode }));
      if (mode === 'partial') {
        setPartialLeaveByKey((prev) => {
          if (prev[key]) return prev;
          const def = defaultPartialFromShiftRange(slot.range);
          return def ? { ...prev, [key]: def } : prev;
        });
      }
    },
    [isFullLeaveBlocked, t],
  );

  const toggleShiftKey = (key: string, slot: MyPublishedShiftSlot, workDate: string) => {
    const blockReason = getLeaveBlockReason(slot, workDate);
    if (!selectedShiftKeys[key] && blockReason !== 'none') {
      Alert.alert(t('typeLeave'), leaveBlockAlertMessage(blockReason));
      return;
    }
    const selecting = !selectedShiftKeys[key];
    setSelectedShiftKeys((prev) => {
      if (prev[key]) {
        return Object.fromEntries(
          Object.entries(prev).filter(([k]) => k !== key),
        ) as Record<string, true>;
      }
      return { ...prev, [key]: true };
    });
    if (selecting && isFullLeaveBlocked(slot, workDate)) {
      setLeaveScopeByKey((prev) => ({ ...prev, [key]: 'partial' }));
      const def = defaultPartialFromShiftRange(slot.range);
      if (def) {
        setPartialLeaveByKey((prev) => (prev[key] ? prev : { ...prev, [key]: def }));
      }
    }
  };

  const resetSlotFields = useCallback(
    (idx: number, slots = requestScheduleContext?.slots ?? []) => {
      const safeIdx = slots[idx] ? idx : 0;
      setSlotIndex(safeIdx);
      const slot = slots[safeIdx];
      if (slot) {
        setProposedTime(hmFromShiftRange(slot.range, punchKind === 'out' ? 'end' : 'start'));
      }
    },
    [requestScheduleContext, punchKind],
  );

  const applyRouteParams = useCallback(() => {
    const rawType = sanitizeRouteParam(params.type);
    const nextType: LeaveRequest['type'] =
      rawType === 'missed_punch' ? 'missed_punch' : 'leave';
    const date = normalizeDateKeyOrToday(params.workDate, getApproximateServerNowDate());
    const idx = params.slotIndex != null ? Number(params.slotIndex) : 0;
    let safeIdx = Number.isFinite(idx) ? idx : 0;
    const nextPunchKind = sanitizeRouteParam(params.punchKind) === 'out' ? 'out' : 'in';
    const weekStart = startOfWeekMondayLocal(parseDateKey(date));
    const contextSlots = requestScheduleContext?.slots ?? [];
    const scheduleId = sanitizeRouteParam(params.scheduleId);
    let slot = contextSlots[safeIdx];
    if (scheduleId) {
      const byIdIdx = contextSlots.findIndex((s) => s.id === scheduleId);
      if (byIdIdx >= 0) {
        safeIdx = byIdIdx;
        slot = contextSlots[byIdIdx];
      } else {
        for (const daySlots of Object.values(publishedScheduleByDate)) {
          const found = daySlots.find((s) => s.id === scheduleId);
          if (found) {
            slot = found;
            break;
          }
        }
      }
    }

    setType((prev) => (prev === nextType ? prev : nextType));
    setWorkDate((prev) => (prev === date ? prev : date));
    setLeaveWeekStart((prev) =>
      calendarDateKey(prev) === calendarDateKey(weekStart) ? prev : weekStart,
    );
    setLeaveFocusDay((prev) => (prev === date ? prev : date));
    setSlotIndex((prev) => (prev === safeIdx ? prev : safeIdx));
    setPunchKind((prev) => (prev === nextPunchKind ? prev : nextPunchKind));

    const nextProposedTime = slot
      ? hmFromShiftRange(slot.range, nextPunchKind === 'out' ? 'end' : 'start')
      : null;
    if (nextProposedTime) {
      setProposedTime((prev) => (prev === nextProposedTime ? prev : nextProposedTime));
    }

    if (nextType === 'leave') {
      setLeaveWindowStartIso(calendarDateKey(weekStart));
      setLeaveWindowEndIso(calendarDateKey(addDaysLocal(weekStart, 6)));
      const nextKeys = slot ? { [shiftSelectionKeyFromSlot(date, slot)]: true as const } : {};
      const nextKey = Object.keys(nextKeys)[0] ?? '';
      setSelectedShiftKeys((prev) => {
        const prevKey = Object.keys(prev)[0] ?? '';
        if (prevKey === nextKey && Object.keys(prev).length === Object.keys(nextKeys).length) {
          return prev;
        }
        return nextKeys;
      });
    } else {
      setSelectedShiftKeys((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    }
  }, [params, requestScheduleContext, publishedScheduleByDate]);

  const routeParamsKey = useMemo(() => {
    const date = normalizeDateKeyOrToday(params.workDate);
    const idx = params.slotIndex != null ? String(params.slotIndex) : '0';
    const slotIds = (requestScheduleContext?.slots ?? []).map((s) => s.id).join(',');
    return [
      sanitizeRouteParam(params.type),
      date,
      idx,
      sanitizeRouteParam(params.punchKind),
      sanitizeRouteParam(params.scheduleId),
      slotIds,
    ].join('|');
  }, [
    params.type,
    params.workDate,
    params.slotIndex,
    params.punchKind,
    params.scheduleId,
    requestScheduleContext?.slots,
  ]);

  const appliedRouteParamsKeyRef = useRef<string | null>(null);
  const applyRouteParamsRef = useRef(applyRouteParams);
  applyRouteParamsRef.current = applyRouteParams;

  useEffect(() => {
    if (closingAfterSubmitRef.current) return;
    if (appliedRouteParamsKeyRef.current === routeParamsKey) return;
    appliedRouteParamsKeyRef.current = routeParamsKey;
    applyRouteParamsRef.current();
  }, [routeParamsKey]);

  const closeAfterSubmit = useCallback(() => {
    if (closingAfterSubmitRef.current) return;
    closingAfterSubmitRef.current = true;
    setLeavePickersEnabled(false);
    setLeaveCalendarOpen(null);
    // MIUI/Android 13/Imin：提交成功后立即清 context / 切页易与键盘、时间滚轮 Modal 卸载竞态崩溃。
    Keyboard.dismiss();
    const navigate = () => router.replace('/requests');
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => requestAnimationFrame(navigate), 300);
      });
    } else {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(navigate);
      });
    }
  }, []);

  const onCreate = async () => {
    try {
    const reasonText = normalizeSubmitReason(reason);
    if (type === 'leave') {
      const shifts = buildShiftsFromSelection(selectedShiftKeys, publishedScheduleByDate);
      if (shifts.length === 0) return;
      const duplicateLeave = shifts.find((shift) =>
        hasOpenLeaveForShift(myAttendanceRequests, shift.workDate, shift),
      );
      if (duplicateLeave) {
        Alert.alert(t('typeLeave'), t('leaveShiftAlreadyPending'));
        return;
      }
      if (!leavePartialValid) {
        Alert.alert(t('typeLeave'), t('leaveTimeInvalid'));
        return;
      }
      const blockedFullLeave = shifts.find((shift) => {
        const key = shiftSelectionKeyFromBinding(shift);
        if ((leaveScopeByKey[key] ?? 'full') !== 'full') return false;
        const found = findSlotForSelectionKey(publishedScheduleByDate, key);
        return found ? isFullLeaveBlocked(found.slot, found.workDate) : false;
      });
      if (blockedFullLeave) {
        Alert.alert(t('typeLeave'), t('leaveFullShiftBlocked'));
        return;
      }
      const leaveTimesByScheduleKey: Record<string, { mode: 'full' | 'partial'; from?: string; to?: string }> =
        {};
      for (const shift of shifts) {
        const key = shiftSelectionKeyFromBinding(shift);
        const scope = leaveScopeByKey[key] ?? 'full';
        if (scope === 'partial') {
          const p = partialLeaveByKey[key];
          if (p?.from && p?.to) {
            leaveTimesByScheduleKey[key] = { mode: 'partial', from: p.from, to: p.to };
          } else {
            leaveTimesByScheduleKey[key] = { mode: 'full' };
          }
        } else {
          leaveTimesByScheduleKey[key] = { mode: 'full' };
        }
      }
      setSubmitBusy(true);
      const res = await submitAttendanceRequest({
        type: 'leave',
        reason: reasonText,
        shifts,
        leaveTimesByScheduleKey,
        leaveTime:
          shifts.length === 1
            ? leaveTimesByScheduleKey[shiftSelectionKeyFromBinding(shifts[0])]
            : undefined,
      });
      if (!res.ok) {
        setSubmitBusy(false);
        Alert.alert(t('typeLeave'), res.message ?? t('requestSubmitFailed'));
        return;
      }
    } else {
      if (!selectedSlot) return;
      const now = getApproximateServerNowDate();
      const today = calendarDateKey(now);
      if (
        !canApplyMissedPunchKind(
          normalizedWorkDate,
          selectedSlot.range,
          selectedPunch,
          today,
          punchKind,
          now,
          selectedSlot.overnightRole ?? 'normal',
          selectedPairPunch,
        )
      ) {
        Alert.alert(t('typeMissedPunch'), t('missedPunchBeforePunchTime'));
        return;
      }
      if (blockingMissedPunchLeave) {
        Alert.alert(t('typeMissedPunch'), t('missedPunchBlockedByLeave'));
        return;
      }
      if (blockingMissedPunchDuplicate) {
        Alert.alert(t('typeMissedPunch'), t('missedPunchAlreadyPending'));
        return;
      }
      const shift = buildShiftBinding(normalizedWorkDate, slotIndex, selectedSlot);
      setSubmitBusy(true);
      const res = await submitAttendanceRequest({
        type: 'missed_punch',
        reason: reasonText,
        workDate: normalizedWorkDate,
        shift,
        punchKind,
        proposedTime: proposedTime.trim(),
      });
      if (!res.ok) {
        setSubmitBusy(false);
        Alert.alert(t('typeMissedPunch'), res.message ?? t('requestSubmitFailed'));
        return;
      }
    }
    closeAfterSubmit();
    } catch (e) {
      setSubmitBusy(false);
      const message = e instanceof Error ? e.message : t('requestSubmitFailed');
      Alert.alert(type === 'leave' ? t('typeLeave') : t('typeMissedPunch'), message);
    }
  };

  const closeCreate = () => {
    setLeavePickersEnabled(false);
    setLeaveCalendarOpen(null);
    Keyboard.dismiss();
    const back = () => {
      setRequestScheduleContext(null);
      router.back();
    };
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(back, 120);
      });
    } else {
      back();
    }
  };

  const pageTitle = type === 'missed_punch' ? t('typeMissedPunch') : t('typeLeave');
  const scrollRef = useRef<ScrollView>(null);
  const reasonWrapRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const [footerHeight, setFooterHeight] = useState(88);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const headerOffset = insets.top + 44;

  const scrollReasonIntoView = useCallback(
    (kbHeight: number) => {
      if (kbHeight <= 0) return;
      reasonWrapRef.current?.measureInWindow((_x, winY, _w, h) => {
        if (h <= 0) return;
        const screenH = Dimensions.get('window').height;
        // Android：底栏可被键盘盖住，只为原因输入留出键盘以上的可视区
        const bottomReserve =
          Platform.OS === 'ios' ? footerHeight + 12 : 16;
        const visibleBottom = screenH - kbHeight - bottomReserve;
        const reasonBottom = winY + h;
        if (reasonBottom <= visibleBottom) return;
        const overlap = reasonBottom - visibleBottom;
        scrollRef.current?.scrollTo({
          y: scrollYRef.current + overlap,
          animated: true,
        });
      });
    },
    [footerHeight],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      const kbH = e.endCoordinates.height;
      setKeyboardHeight(kbH);
      setTimeout(() => scrollReasonIntoView(kbH), Platform.OS === 'android' ? 120 : 50);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollReasonIntoView]);

  const onReasonFocus = useCallback(() => {
    const kbH = keyboardHeight;
    if (kbH > 0) {
      setTimeout(() => scrollReasonIntoView(kbH), 80);
      return;
    }
    const estKb = Platform.OS === 'ios' ? 280 : 320;
    setTimeout(() => scrollReasonIntoView(estKb), Platform.OS === 'ios' ? 320 : 360);
  }, [keyboardHeight, scrollReasonIntoView]);

  const canSubmit =
    !submitBusy &&
    (type === 'leave'
      ? selectedLeaveCount > 0 && leavePartialValid
      : daySlots.length > 0 && !!selectedSlot && !blockingMissedPunch);

  const renderMissedPunchForm = () => (
    <>
      <Text style={styles.label}>{t('requestWorkDate')}</Text>
      <Text style={styles.dateReadonly}>{formatPunchHeaderDate(workDate, i18n.language)}</Text>
      <Text style={styles.label}>{t('requestShiftSegment')}</Text>
      {daySlots.length === 0 ? (
        <Text style={styles.warn}>{t('requestNoShifts')}</Text>
      ) : (
        <View style={styles.slotList}>
          {daySlots.map((slot, idx) => {
            const on = idx === slotIndex;
            return (
              <Pressable
                key={`${workDate}-${slot.id}`}
                onPress={() => resetSlotFields(idx)}
                style={[styles.slotCard, on && styles.slotCardOn]}
              >
                <Text style={[styles.slotCardTitle, on && styles.slotCardTitleOn]}>
                  {slot.areaName} · {slot.shiftName}
                </Text>
                <Text style={[styles.slotCardTime, on && styles.slotCardTimeOn]}>
                  {slot.range}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {blockingMissedPunchLeave ? (
        <Text style={styles.warn}>{t('missedPunchBlockedByLeave')}</Text>
      ) : blockingMissedPunchTooEarly ? (
        <Text style={styles.warn}>{t('missedPunchBeforePunchTime')}</Text>
      ) : blockingMissedPunchDuplicate ? (
        <Text style={styles.warn}>{t('missedPunchAlreadyPending')}</Text>
      ) : null}
      {selectedSlot?.overnightRole === 'start' || selectedSlot?.overnightRole === 'end' ? (
        <Text style={styles.warn}>
          {selectedSlot.overnightRole === 'start'
            ? t('overnightMissedPunchInOnly')
            : t('overnightMissedPunchOutOnly')}
        </Text>
      ) : (
        <>
          <Text style={styles.label}>{t('missedPunchKind')}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => !missedPunchInTooEarly && setPunchKind('in')}
              style={[
                styles.chip,
                punchKind === 'in' && styles.chipOn,
                missedPunchInTooEarly && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  punchKind === 'in' && styles.chipTextOn,
                  missedPunchInTooEarly && styles.chipTextDisabled,
                ]}
              >
                {t('clockIn')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => !missedPunchOutTooEarly && setPunchKind('out')}
              style={[
                styles.chip,
                punchKind === 'out' && styles.chipOn,
                missedPunchOutTooEarly && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  punchKind === 'out' && styles.chipTextOn,
                  missedPunchOutTooEarly && styles.chipTextDisabled,
                ]}
              >
                {t('clockOut')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      <Text style={styles.label}>{t('missedPunchProposedTime')}</Text>
      <TimeSelectField
        value={proposedTime}
        onChange={setProposedTime}
        wheelAnchor={missedPunchWheelAnchor}
        disabled={!leavePickersEnabled}
      />
    </>
  );

  const selectAllFocusedDay = () => {
    const slots = publishedScheduleByDate[leaveFocusDay] ?? [];
    const selectable = slots.filter((s) => !isShiftLeaveBlocked(s, leaveFocusDay));
    if (selectable.length === 0 && slots.length > 0) {
      const first = slots[0];
      const reason = getLeaveBlockReason(first, leaveFocusDay);
      Alert.alert(t('typeLeave'), leaveBlockAlertMessage(reason));
      return;
    }
    setSelectedShiftKeys((prev) => {
      const next = { ...prev };
      for (const slot of selectable) {
        next[shiftSelectionKeyFromSlot(leaveFocusDay, slot)] = true;
      }
      return next;
    });
  };

  const clearAllSelection = () => setSelectedShiftKeys({});

  const clearFocusedDay = () => {
    setSelectedShiftKeys((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (parseShiftSelectionKey(key)?.workDate === leaveFocusDay) delete next[key];
      }
      return next;
    });
  };

  const renderLeaveForm = () => {
    const { lo: winLo, hi: winHi } = leaveWindowLowHigh;
    const focusedSelectedCount = countSelectedOnDay(leaveFocusDay);
    const selectableFocusedSlots = focusedSlots.filter(
      (s) => !isShiftLeaveBlocked(s, leaveFocusDay),
    );
    const allFocusedSelected =
      selectableFocusedSlots.length > 0 &&
      selectableFocusedSlots.every(
        (s) => selectedShiftKeys[shiftSelectionKeyFromSlot(leaveFocusDay, s)],
      );

    return (
      <View style={styles.leavePanel}>
        <View style={styles.summaryBanner}>
          <View style={styles.summaryBannerLeft}>
            <View style={styles.summaryIconWrap}>
              <Ionicons color={colors.primaryDark} name="calendar-outline" size={20} />
            </View>
            <View style={styles.summaryTextCol}>
              <Text style={styles.summaryCount}>
                {t('leaveSelectedCount', { count: selectedLeaveCount })}
              </Text>
            </View>
          </View>
          {selectedLeaveCount > 0 ? (
            <Pressable hitSlop={8} onPress={clearAllSelection} style={styles.clearLink}>
              <Text style={styles.clearLinkText}>{t('leaveClearSelection')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.leaveCalendarHint}>{t('leaveShiftCalendarHint')}</Text>
        <View style={styles.leaveDatePickRow}>
          <View style={styles.leaveDatePickCol}>
            <Text style={styles.label}>{t('leaveShiftPeriodStart')}</Text>
            <Pressable onPress={() => setLeaveCalendarOpen('start')} style={styles.leaveDatePickBtn}>
              <Text style={styles.leaveDatePickBtnText} numberOfLines={1}>
                {formatPunchHeaderDate(leaveWindowStartIso, dateLang)}
              </Text>
              <Ionicons color={colors.primary} name="calendar-outline" size={18} />
            </Pressable>
          </View>
          <View style={styles.leaveDatePickCol}>
            <Text style={styles.label}>{t('leaveShiftPeriodEnd')}</Text>
            <Pressable onPress={() => setLeaveCalendarOpen('end')} style={styles.leaveDatePickBtn}>
              <Text style={styles.leaveDatePickBtnText} numberOfLines={1}>
                {formatPunchHeaderDate(leaveWindowEndIso, dateLang)}
              </Text>
              <Ionicons color={colors.primary} name="calendar-outline" size={18} />
            </Pressable>
          </View>
        </View>

        <View style={styles.weekBar}>
          <Pressable hitSlop={8} onPress={goPrevLeaveWeekNav} style={styles.weekChevron}>
            <Ionicons color={colors.primary} name="chevron-back" size={24} />
          </Pressable>
          <View style={styles.weekBarCenter}>
            <Text style={styles.weekRangeBold}>{leaveWeekNav.rangeLine}</Text>
            <Text style={styles.weekMetaMuted}>{leaveWeekNav.metaLine}</Text>
          </View>
          <Pressable hitSlop={8} onPress={goNextLeaveWeekNav} style={styles.weekChevron}>
            <Ionicons color={colors.primary} name="chevron-forward" size={24} />
          </Pressable>
        </View>

        <View style={styles.dayRow}>
          {leaveWeekDays.map((day) => {
            const active = day.iso === leaveFocusDay;
            const weekdayIdx = (day.date.getDay() + 6) % 7;
            const hasWork = (publishedScheduleByDate[day.iso]?.length ?? 0) > 0;
            const picked = countSelectedOnDay(day.iso);
            const inWindow =
              compareDateKeys(day.iso, winLo) >= 0 && compareDateKeys(day.iso, winHi) <= 0;
            return (
              <Pressable
                key={day.iso}
                disabled={!inWindow}
                onPress={() => {
                  if (!inWindow) return;
                  setLeaveFocusDay(day.iso);
                }}
                style={[
                  styles.dayCell,
                  active && styles.dayCellActive,
                  !inWindow && styles.dayCellMuted,
                ]}
              >
                <Text style={[styles.dayCellWeek, active && styles.dayCellWeekActive]} numberOfLines={1}>
                  {weekdayAbbr[weekdayIdx] ?? ''}
                </Text>
                <Text style={[styles.dayCellNum, active && styles.dayCellNumActive]}>{day.date.getDate()}</Text>
                {picked > 0 ? (
                  <View style={[styles.dayPickBadge, active && styles.dayPickBadgeOnCell]}>
                    <Text style={[styles.dayPickBadgeText, active && styles.dayPickBadgeTextOnCell]}>
                      {picked > 9 ? '9+' : picked}
                    </Text>
                  </View>
                ) : hasWork ? (
                  <View style={styles.dayWorkDot} />
                ) : (
                  <View style={styles.dayWorkDotPlaceholder} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.focusDayHead}>
          <Text style={styles.focusDayTitle}>{formatPunchHeaderDate(leaveFocusDay, i18n.language)}</Text>
          {selectableFocusedSlots.length > 0 ? (
            <Pressable
              hitSlop={8}
              onPress={allFocusedSelected ? clearFocusedDay : selectAllFocusedDay}
              style={styles.dayActionLink}
            >
              <Text style={styles.dayActionLinkText}>
                {allFocusedSelected ? t('leaveClearDay') : t('leaveSelectAllDay')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {leaveScheduleLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>{t('scheduleLoading')}</Text>
          </View>
        ) : focusedSlots.length === 0 ? (
          <View style={styles.emptyDayBox}>
            <Ionicons color={colors.textMuted} name="bed-outline" size={32} />
            <Text style={styles.emptyDayText}>{t('dayRestShort')}</Text>
          </View>
        ) : (
          <View style={styles.shiftPickList}>
            {focusedSlots.map((slot) => {
              const key = shiftSelectionKeyFromSlot(leaveFocusDay, slot);
              const checked = !!selectedShiftKeys[key];
              const blockReason = getLeaveBlockReason(slot, leaveFocusDay);
              const blocked = blockReason !== 'none';
              const punch = getShiftPunch(leaveFocusDay, slot);
              const punchLine = formatShiftPunchLine(punch, i18n.language);
              const fullLeaveBlocked = isFullLeaveBlocked(slot, leaveFocusDay);
              const slotBounds = parseScheduledHmRange(slot.range);
              const scope = leaveScopeByKey[key] ?? (fullLeaveBlocked ? 'partial' : 'full');
              const partial =
                partialLeaveByKey[key] ??
                (scope === 'partial' && slotBounds
                  ? { from: slotBounds.start, to: slotBounds.end }
                  : undefined);
              const showPerShiftPartial =
                checked && !blocked && scope === 'partial' && slotBounds && partial;
              return (
                <View
                  key={key}
                  style={[
                    styles.shiftPickCard,
                    checked && styles.shiftPickCardOn,
                    blocked && styles.shiftPickCardBlocked,
                  ]}
                >
                  <Pressable
                    onPress={() => toggleShiftKey(key, slot, leaveFocusDay)}
                    style={styles.shiftPickRow}
                    disabled={blocked}
                  >
                    <View style={styles.shiftPickMain}>
                      <Text
                        style={[
                          styles.shiftPickTime,
                          checked && styles.shiftPickTimeOn,
                          blocked && styles.shiftPickTextMuted,
                        ]}
                      >
                        {slot.range}
                      </Text>
                      <View style={styles.shiftPickMetaRow}>
                        <Text style={styles.shiftPickMetaLbl}>{t('scheduleRegion')}</Text>
                        <Text style={styles.shiftPickMetaVal}>{slot.areaName}</Text>
                      </View>
                      <View style={styles.shiftPickMetaRow}>
                        <Text style={styles.shiftPickMetaLbl}>{t('scheduleShift')}</Text>
                        <Text style={styles.shiftPickMetaVal}>{slot.shiftName}</Text>
                      </View>
                      {punchLine ? (
                        <View style={styles.shiftPickMetaRow}>
                          <Text style={styles.shiftPickMetaLbl}>{t('leaveShiftPunchLabel')}</Text>
                          <Text style={[styles.shiftPickMetaVal, styles.shiftPickPunchVal]}>
                            {punchLine}
                          </Text>
                        </View>
                      ) : null}
                      {blocked ? (
                        <Text style={styles.shiftBlockedHint}>
                          {leaveBlockAlertMessage(blockReason)}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.checkCircle,
                        checked && styles.checkCircleOn,
                        blocked && styles.checkCircleBlocked,
                      ]}
                    >
                      {checked ? (
                        <Ionicons color="#fff" name="checkmark" size={20} />
                      ) : blocked ? (
                        <Ionicons color={colors.textMuted} name="lock-closed" size={18} />
                      ) : null}
                    </View>
                  </Pressable>
                  {checked ? (
                    <View style={styles.shiftScopeBlock}>
                      <Text style={styles.shiftScopeLabel}>{t('leaveTimeModeLabel')}</Text>
                      <View style={styles.row}>
                        <Pressable
                          onPress={() =>
                            setShiftLeaveScope(key, 'full', slot, leaveFocusDay)
                          }
                          disabled={fullLeaveBlocked}
                          style={[
                            styles.chip,
                            styles.chipCompact,
                            scope === 'full' && styles.chipOn,
                            fullLeaveBlocked && styles.chipDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              scope === 'full' && styles.chipTextOn,
                              fullLeaveBlocked && styles.chipTextDisabled,
                            ]}
                          >
                            {t('leaveTimeFull')}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            setShiftLeaveScope(key, 'partial', slot, leaveFocusDay)
                          }
                          style={[styles.chip, styles.chipCompact, scope === 'partial' && styles.chipOn]}
                        >
                          <Text style={[styles.chipText, scope === 'partial' && styles.chipTextOn]}>
                            {t('leaveTimePartial')}
                          </Text>
                        </Pressable>
                      </View>
                      {fullLeaveBlocked ? (
                        <Text style={styles.shiftBlockedHint}>{t('leaveFullShiftBlocked')}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {showPerShiftPartial ? (
                    <View style={styles.shiftPartialTime}>
                      <View style={styles.leaveTimeRangeRow}>
                        <View style={styles.leaveTimeCol}>
                          <Text style={styles.leaveTimeColLabel}>{t('leaveTimeFrom')}</Text>
                          <TimeSelectField
                            value={partial.from}
                            onChange={(v) => updatePartialLeave(key, { from: v })}
                            wheelAnchor={slotBounds.start}
                            disabled={!leavePickersEnabled}
                          />
                        </View>
                        <Text style={styles.leaveTimeRangeSep}>–</Text>
                        <View style={styles.leaveTimeCol}>
                          <Text style={styles.leaveTimeColLabel}>{t('leaveTimeTo')}</Text>
                          <TimeSelectField
                            value={partial.to}
                            onChange={(v) => updatePartialLeave(key, { to: v })}
                            wheelAnchor={slotBounds.end}
                            disabled={!leavePickersEnabled}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {selectedLeaveCount === 0 && focusedSlots.length > 0 ? (
          <Text style={styles.leaveTimeHint}>{t('leaveTimePickShiftHint')}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: pageTitle,
          headerShown: true,
          headerBackTitle: t('cancel'),
        }}
      />
      <View style={styles.page}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
          keyboardVerticalOffset={headerOffset}
          style={styles.pageKeyboard}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.pageScroll}
            contentContainerStyle={styles.pageContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator
          >
            {type === 'missed_punch' ? renderMissedPunchForm() : renderLeaveForm()}

            <View ref={reasonWrapRef} collapsable={false}>
              <Text style={styles.label}>{t('reason')}</Text>
              <TextInput
                multiline
                onChangeText={setReason}
                onFocus={onReasonFocus}
                style={[styles.input, styles.reasonInput]}
                value={reason}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={[styles.footerActions, { paddingBottom: Math.max(16, insets.bottom) }]}
        >
          <Pressable onPress={closeCreate} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (submitBusy || !canSubmit) return;
              void onCreate();
            }}
            disabled={!canSubmit || submitBusy}
            style={[styles.primaryBtn, (!canSubmit || submitBusy) && styles.primaryBtnDisabled]}
          >
            {submitBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryText}>{t('submit')}</Text>
            )}
          </Pressable>
        </View>
      </View>
      {type === 'leave' && leaveCalendarOpen ? (
        <CalendarDatePickerModal
          visible
          title={
            leaveCalendarOpen === 'end' ? t('leaveShiftPeriodEnd') : t('leaveShiftPeriodStart')
          }
          anchorIso={leaveCalendarOpen === 'end' ? leaveWindowEndIso : leaveWindowStartIso}
          minIso={leaveCalendarOpen === 'end' ? leaveWindowStartIso : undefined}
          onRequestClose={() => setLeaveCalendarOpen(null)}
          onSelectDate={(iso) => applyLeaveWindowDate(leaveCalendarOpen, iso)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  pageKeyboard: { flex: 1 },
  pageScroll: { flex: 1 },
  pageContent: { padding: 20, paddingBottom: 24 },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  warn: { marginTop: 8, fontSize: 13, color: colors.warning, fontWeight: '600' },
  label: { marginTop: 10, fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  dateReadonly: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: colors.border,
  },
  leavePanel: { marginTop: 4, gap: 0 },
  leaveTimeSection: { marginTop: 14 },
  leaveTimeRangeRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  leaveTimeCol: { flex: 1, minWidth: 0 },
  leaveTimeColLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  leaveTimeRangeSep: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textMuted,
    paddingBottom: 14,
  },
  leaveTimeReadonly: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  summaryBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextCol: { flex: 1, minWidth: 0 },
  summaryCount: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  clearLink: { paddingVertical: 4, paddingHorizontal: 2 },
  clearLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  weekBar: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weekChevron: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekBarCenter: { flex: 1, alignItems: 'center' },
  weekRangeBold: { fontSize: 16, fontWeight: '800', color: colors.text },
  weekMetaMuted: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  dayRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayCellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayCellMuted: { opacity: 0.38 },
  leaveCalendarHint: { marginTop: 10, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  leaveDatePickRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  leaveDatePickCol: { flex: 1, minWidth: 0 },
  leaveDatePickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  leaveDatePickBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  dayCellWeek: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
    width: '100%',
  },
  dayCellWeekActive: { color: '#FFFFFF' },
  dayCellNum: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  dayCellNumActive: { color: '#FFFFFF' },
  dayPickBadge: {
    marginTop: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPickBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  dayPickBadgeOnCell: { backgroundColor: '#FFFFFF' },
  dayPickBadgeTextOnCell: { color: colors.primaryDark },
  dayWorkDot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  dayWorkDotPlaceholder: { marginTop: 4, height: 5 },
  focusDayHead: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  focusDayTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  dayActionLink: { paddingVertical: 4, paddingHorizontal: 2 },
  dayActionLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  loadingRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: colors.textMuted },
  emptyDayBox: {
    marginTop: 8,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyDayText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  shiftPickList: { marginTop: 8, gap: 10 },
  shiftPickCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shiftPickCardOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  shiftPickCardBlocked: {
    opacity: 0.72,
    backgroundColor: '#F4F5F7',
  },
  shiftPickTextMuted: { color: colors.textMuted },
  shiftPickPunchVal: { fontWeight: '700', color: colors.primaryDark },
  shiftBlockedHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
    lineHeight: 17,
  },
  shiftPickRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shiftPickMain: { flex: 1, minWidth: 0, gap: 6 },
  shiftPickTime: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: 0.2 },
  shiftPickTimeOn: { color: colors.primaryDark },
  shiftPickMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftPickMetaLbl: { fontSize: 11, fontWeight: '700', color: colors.textMuted, width: 36 },
  shiftPickMetaVal: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkCircleOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkCircleBlocked: {
    borderColor: colors.border,
    backgroundColor: '#EEF0F4',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFD',
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipDisabled: { opacity: 0.45 },
  chipTextDisabled: { color: colors.textMuted },
  chipText: { color: colors.textMuted, fontWeight: '700' },
  chipTextOn: { color: colors.primaryDark },
  leaveTimeHint: { marginBottom: 8, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  shiftScopeBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  shiftScopeLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  shiftPartialTime: { marginTop: 10 },
  chipCompact: { paddingVertical: 8, paddingHorizontal: 12 },
  slotList: { marginTop: 8, gap: 8 },
  slotCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFD',
  },
  slotCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  slotCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  slotCardTitleOn: { color: colors.primaryDark },
  slotCardTime: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.textMuted },
  slotCardTimeOn: { color: colors.primaryDark },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  reasonInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryText: { fontWeight: '800', color: colors.text },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { fontWeight: '800', color: '#fff' },
});
