import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import {
  groupPublishedScheduleByDate,
  type MyPublishedShiftSlot,
} from '../../src/api/mapPublishedSchedule';
import {
  groupStoreFieldJobsByDate,
  type StoreDayFieldJob,
} from '../../src/api/mapStoreFieldJobs';
import {
  groupStorePublishedScheduleByDate,
  type StoreDayRegionGroup,
  type StoreRosterStaffEntry,
} from '../../src/api/mapStorePublishedSchedule';
import { fetchMyPublishedSchedule, fetchStorePublishedFieldJobs, fetchStorePublishedSchedule } from '../../src/api/schedule';
import { FieldJobRow } from '../../src/components/FieldJobRow';
import { MyShiftCard } from '../../src/components/MyShiftCard';
import { StoreFieldJobCard } from '../../src/components/StoreFieldJobCard';
import { getActiveStore, useAuth } from '../../src/context/AuthContext';
import {
  getShiftLeaveRequestStatus,
  isMissedPunchBlockedByLeave,
} from '../../src/utils/leaveRequestEligibility';
import {
  getMissedPunchPendingStatus,
  getShiftMissedPunchOpenStatus,
  isShiftLeaveBlockedByMissedPunch,
} from '../../src/utils/missedPunchEligibility';
import { doesPunchCoverScheduledShift } from '../../src/utils/shiftLeaveEligibility';
import { canApplyMissedPunchForShift, getShiftCardActions } from '../../src/utils/shiftClockWindow';
import { openShiftRequest } from '../../src/utils/openShiftRequest';
import { colors } from '../../src/theme/colors';
import { calendarDateKey, normalizeDateKeyOrToday } from '../../src/utils/calendarDateKey';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { getApproximateServerNowDate } from '../../src/utils/serverClock';
import { fetchWorkSummariesByDates, resolveFieldJobsForSchedule } from '../../src/utils/fieldJobsSchedule';
import type { TimelineFieldJobItem, TodayWorkSummary } from '../../src/types/fieldService';
import { executeWorkPunch, workPunchMatchesStoreShift } from '../../src/utils/workPunch';
import { canViewStoreRoster } from '../../src/utils/storeManagement';
import {
  buildStoreRosterTimeline,
  storeTimelineHasContent,
} from '../../src/utils/storeRosterTimeline';
import {
  formatSelectedHeaderLine,
  weekNavigatorLabels,
} from '../../src/utils/localeDateFormat';

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMonday(ref: Date) {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayHasWork(
  iso: string,
  mode: 'my' | 'store',
  myShiftsByDate: Record<string, MyPublishedShiftSlot[]>,
  storeRosterByDate: Record<string, StoreDayRegionGroup[]>,
  fieldJobsByDate: Record<string, TimelineFieldJobItem[]>,
  storeFieldJobsByDate: Record<string, StoreDayFieldJob[]>,
): boolean {
  if (mode === 'my') {
    return (myShiftsByDate[iso]?.length ?? 0) > 0 || (fieldJobsByDate[iso]?.length ?? 0) > 0;
  }
  const roster = storeRosterByDate[iso] ?? [];
  const hasRoster = roster.some((rg) => rg.shifts.some((sh) => sh.staff.length > 0));
  return hasRoster || (storeFieldJobsByDate[iso]?.length ?? 0) > 0;
}

function StoreRosterStaffPill({
  entry,
  t,
}: {
  entry: StoreRosterStaffEntry;
  t: (key: string, opts?: Record<string, string>) => string;
}) {
  const isSubstitution = entry.rosterStatus === 'substitution';
  const isOnLeave = entry.rosterStatus === 'on_leave';
  return (
    <View
      style={[
        styles.storeStaffPill,
        !isSubstitution && !isOnLeave && styles.storeStaffPillNormal,
        isSubstitution && styles.storeStaffPillSubstitution,
        isOnLeave && styles.storeStaffPillOnLeave,
      ]}
    >
      <Text
        style={[
          styles.storeStaffText,
          !isSubstitution && !isOnLeave && styles.storeStaffTextNormal,
          isSubstitution && styles.storeStaffTextSubstitution,
          isOnLeave && styles.storeStaffTextOnLeave,
        ]}
        numberOfLines={1}
      >
        {entry.name}
      </Text>
      {isSubstitution ? (
        <Text style={styles.storeStaffBadgeSub}>{t('scheduleSubstitutionBadge')}</Text>
      ) : isOnLeave ? (
        <Text style={styles.storeStaffBadgeLeave}>{t('storeRosterStatusOnLeave')}</Text>
      ) : null}
    </View>
  );
}

function StoreRosterLegendBar({ t }: { t: (key: string) => string }) {
  return (
    <View style={styles.storeRosterLegendBar}>
      <View style={styles.storeRosterLegendItem}>
        <View style={[styles.storeRosterLegendDot, styles.storeRosterLegendDotNormal]} />
        <Text style={styles.storeRosterLegendText}>{t('storeRosterLegendNormal')}</Text>
      </View>
      <View style={styles.storeRosterLegendItem}>
        <View style={[styles.storeRosterLegendDot, styles.storeRosterLegendDotSubstitution]} />
        <Text style={styles.storeRosterLegendText}>{t('scheduleSubstitutionBadge')}</Text>
      </View>
      <View style={styles.storeRosterLegendItem}>
        <View style={[styles.storeRosterLegendDot, styles.storeRosterLegendDotOnLeave]} />
        <Text style={styles.storeRosterLegendText}>{t('storeRosterStatusOnLeave')}</Text>
      </View>
    </View>
  );
}

export default function ScheduleWeekScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const {
    session,
    language,
    setSelectedStore,
    myAttendanceRequests,
    refreshAttendanceRequests,
    refreshCurrentEmployee,
    mergePublishedSchedule,
    getShiftPunch,
    shiftPunches,
    punchShift,
    refreshShiftPunchesForDate,
    isShiftPunchDateLoaded,
    setRequestScheduleContext,
  } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!session?.user?.selectedStoreId) return;
    void refreshAttendanceRequests();
  }, [session?.user?.selectedStoreId, refreshAttendanceRequests]);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.selectedStoreId) return;
      void refreshAttendanceRequests();
    }, [session?.user?.selectedStoreId, refreshAttendanceRequests]),
  );
  const routeDateRaw = typeof params.date === 'string' ? params.date.trim() : '';
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(routeDateRaw)
    ? routeDateRaw
    : calendarDateKey(getApproximateServerNowDate());

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekMonday(parseIsoToLocalDate(initialDate)),
  );
  const [selected, setSelected] = useState(() => initialDate);
  const [mode, setMode] = useState<'my' | 'store'>('my');
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [myShiftsByDate, setMyShiftsByDate] = useState<Record<string, MyPublishedShiftSlot[]>>({});
  const [myScheduleLoading, setMyScheduleLoading] = useState(false);
  const [myScheduleError, setMyScheduleError] = useState<string | null>(null);
  const [storeRosterByDate, setStoreRosterByDate] = useState<
    Record<string, StoreDayRegionGroup[]>
  >({});
  const [storeScheduleLoading, setStoreScheduleLoading] = useState(false);
  const [storeScheduleError, setStoreScheduleError] = useState<string | null>(null);
  const [storeFieldJobsByDate, setStoreFieldJobsByDate] = useState<Record<string, StoreDayFieldJob[]>>({});
  const [storeFieldJobsLoading, setStoreFieldJobsLoading] = useState(false);
  const [punchBusyId, setPunchBusyId] = useState<string | null>(null);
  const [fieldTimelineByDate, setFieldTimelineByDate] = useState<Record<string, TodayWorkSummary['timeline']>>({});
  const [workSummariesByDate, setWorkSummariesByDate] = useState<Record<string, TodayWorkSummary>>({});

  const weekEndIso = useMemo(() => calendarDateKey(addDays(weekStart, 6)), [weekStart]);
  const weekStartIso = useMemo(() => calendarDateKey(weekStart), [weekStart]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { iso: calendarDateKey(d), date: d };
    });
  }, [weekStart]);

  const weekdayAbbr = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  const selectedStoreId = session?.user?.selectedStoreId ?? '';
  const canSeeStore = canViewStoreRoster(session?.user, selectedStoreId);

  useEffect(() => {
    if (mode === 'store' && !canSeeStore) {
      setMode('my');
    }
  }, [mode, canSeeStore]);

  const loadMySchedule = useCallback(async () => {
    if (!selectedStoreId) {
      setMyShiftsByDate({});
      return;
    }
    setMyScheduleLoading(true);
    setMyScheduleError(null);
    try {
      const data = await fetchMyPublishedSchedule({
        storeId: selectedStoreId,
        from: weekStartIso,
        to: weekEndIso,
      });
      const grouped = groupPublishedScheduleByDate(data.items ?? []);
      setMyShiftsByDate(grouped);
      mergePublishedSchedule(grouped);
    } catch (e) {
      setMyShiftsByDate({});
      const message = e instanceof ApiError ? e.message : t('scheduleLoadFailed');
      setMyScheduleError(message);
    } finally {
      setMyScheduleLoading(false);
    }
  }, [selectedStoreId, weekStartIso, weekEndIso, t, mergePublishedSchedule]);

  const loadStoreSchedule = useCallback(async () => {
    if (!selectedStoreId || !canSeeStore) {
      setStoreRosterByDate({});
      return;
    }
    setStoreScheduleLoading(true);
    setStoreScheduleError(null);
    try {
      const data = await fetchStorePublishedSchedule({
        storeId: selectedStoreId,
        from: weekStartIso,
        to: weekEndIso,
      });
      setStoreRosterByDate(groupStorePublishedScheduleByDate(data.items ?? []));
    } catch (e) {
      setStoreRosterByDate({});
      const message = e instanceof ApiError ? e.message : t('scheduleLoadFailed');
      setStoreScheduleError(message);
    } finally {
      setStoreScheduleLoading(false);
    }
  }, [selectedStoreId, canSeeStore, weekStartIso, weekEndIso, t]);

  const loadStoreFieldJobsForWeek = useCallback(async () => {
    if (!selectedStoreId || !canSeeStore) {
      setStoreFieldJobsByDate({});
      return;
    }
    setStoreFieldJobsLoading(true);
    try {
      const data = await fetchStorePublishedFieldJobs({
        storeId: selectedStoreId,
        from: weekStartIso,
        to: weekEndIso,
      });
      setStoreFieldJobsByDate(groupStoreFieldJobsByDate(data.items ?? []));
    } catch {
      setStoreFieldJobsByDate({});
    } finally {
      setStoreFieldJobsLoading(false);
    }
  }, [selectedStoreId, canSeeStore, weekStartIso, weekEndIso]);

  const loadFieldJobsForWeek = useCallback(async () => {
    if (!selectedStoreId) {
      setFieldTimelineByDate({});
      setWorkSummariesByDate({});
      return;
    }
    const dateIsos = Array.from({ length: 7 }, (_, i) => calendarDateKey(addDays(weekStart, i)));
    const summaries = await fetchWorkSummariesByDates(selectedStoreId, dateIsos);
    setWorkSummariesByDate(summaries);
    const timelines: Record<string, TodayWorkSummary['timeline']> = {};
    for (const [date, summary] of Object.entries(summaries)) {
      timelines[date] = summary.timeline;
    }
    setFieldTimelineByDate(timelines);
  }, [selectedStoreId, weekStart]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadMySchedule();
  }, [session?.user, selectedStoreId, loadMySchedule]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId || !canSeeStore) return;
    void loadStoreSchedule();
    void loadStoreFieldJobsForWeek();
  }, [session?.user, selectedStoreId, canSeeStore, loadStoreSchedule, loadStoreFieldJobsForWeek]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadFieldJobsForWeek();
  }, [session?.user, selectedStoreId, loadFieldJobsForWeek]);

  const loadDayPunches = useCallback(async () => {
    if (!selectedStoreId || !selected) return;
    await refreshShiftPunchesForDate(selected);
    const slots = myShiftsByDate[selected] ?? [];
    const prevDates = new Set<string>();
    for (const s of slots) {
      if (s.overnightRole === 'end' && s.overnightPairCellId) {
        const [y, m, d] = selected.split('-').map(Number);
        const prev = new Date(y, m - 1, d);
        prev.setDate(prev.getDate() - 1);
        const py = prev.getFullYear();
        const pm = `${prev.getMonth() + 1}`.padStart(2, '0');
        const pd = `${prev.getDate()}`.padStart(2, '0');
        prevDates.add(`${py}-${pm}-${pd}`);
      }
    }
    for (const d of prevDates) {
      await refreshShiftPunchesForDate(d);
    }
  }, [selectedStoreId, selected, refreshShiftPunchesForDate, myShiftsByDate]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadDayPunches();
  }, [session?.user, selectedStoreId, selected, loadDayPunches]);

  const myShifts = myShiftsByDate[selected] ?? [];
  const todayIso = calendarDateKey(getApproximateServerNowDate());
  const punchesKnown = isShiftPunchDateLoaded(selected);
  const fieldJobsByDate = useMemo(() => {
    const map: Record<string, TimelineFieldJobItem[]> = {};
    for (const [date, timeline] of Object.entries(fieldTimelineByDate)) {
      const shifts = myShiftsByDate[date] ?? [];
      const resolved = resolveFieldJobsForSchedule(shifts, timeline, date);
      map[date] = resolved.allFieldJobs;
    }
    return map;
  }, [fieldTimelineByDate, myShiftsByDate]);
  const selectedFieldResolved = useMemo(
    () => resolveFieldJobsForSchedule(myShifts, fieldTimelineByDate[selected] ?? [], selected),
    [myShifts, fieldTimelineByDate, selected],
  );
  const selectedFieldGroups = {
    byShiftId: selectedFieldResolved.fieldJobsByShiftId,
    standalone: selectedFieldResolved.standaloneFieldJobs,
  };
  const selectedFieldJobCount = selectedFieldResolved.allFieldJobs.length;
  const getPairPunchForSlot = useCallback(
    (slot: MyPublishedShiftSlot) => {
      if (slot.overnightRole === 'end' && slot.overnightPairCellId) {
        return shiftPunches.find((p) => p.scheduleId === slot.overnightPairCellId);
      }
      return undefined;
    },
    [shiftPunches],
  );
  const storeDayRoster = useMemo(
    () => storeRosterByDate[selected] ?? [],
    [selected, storeRosterByDate],
  );
  const storeDayFieldJobs = useMemo(
    () => storeFieldJobsByDate[selected] ?? [],
    [selected, storeFieldJobsByDate],
  );
  const storeDayTimeline = useMemo(
    () => buildStoreRosterTimeline(storeDayRoster, storeDayFieldJobs, selected),
    [storeDayRoster, storeDayFieldJobs, selected],
  );
  const storeDayHasContent = storeTimelineHasContent(storeDayTimeline);

  const selectedDateObj = useMemo(() => parseIsoToLocalDate(selected), [selected]);
  const dateLang = language ?? i18n.language;
  const selectedHeaderLine = useMemo(
    () => formatSelectedHeaderLine(selectedDateObj, dateLang),
    [selectedDateObj, dateLang],
  );
  const weekNavLabels = useMemo(
    () => weekNavigatorLabels(weekStart, dateLang),
    [weekStart, dateLang],
  );

  const goToday = () => {
    const now = getApproximateServerNowDate();
    setWeekStart(startOfWeekMonday(now));
    setSelected(calendarDateKey(now));
  };

  const refreshPageData = useCallback(async () => {
    const tasks: Promise<unknown>[] = [
      refreshCurrentEmployee(),
      loadMySchedule(),
      loadFieldJobsForWeek(),
      loadDayPunches(),
      refreshAttendanceRequests(),
    ];
    if (canSeeStore) {
      tasks.push(loadStoreSchedule(), loadStoreFieldJobsForWeek());
    }
    await Promise.all(tasks);
  }, [
    refreshCurrentEmployee,
    loadMySchedule,
    loadFieldJobsForWeek,
    loadDayPunches,
    refreshAttendanceRequests,
    canSeeStore,
    loadStoreSchedule,
    loadStoreFieldJobsForWeek,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshPageData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshPageData]);

  useRefreshOnAppForeground(refreshPageData);

  const prevWeek = () =>
    setWeekStart((ws) => {
      const n = addDays(ws, -7);
      setSelected(calendarDateKey(n));
      return n;
    });
  const nextWeek = () =>
    setWeekStart((ws) => {
      const n = addDays(ws, 7);
      setSelected(calendarDateKey(n));
      return n;
    });

  const runPunch = useCallback(
    async (slotId: string, kind: 'in' | 'out') => {
      const action = workSummariesByDate[selected]?.currentPunchAction;
      if (selected === todayIso && workPunchMatchesStoreShift(action, slotId) && action && selectedStoreId) {
        setPunchBusyId(slotId);
        try {
          const summary = await executeWorkPunch({ storeId: selectedStoreId, action });
          setWorkSummariesByDate((prev) => ({ ...prev, [selected]: summary }));
          setFieldTimelineByDate((prev) => ({ ...prev, [selected]: summary.timeline }));
          await loadDayPunches();
          Alert.alert(t('tabSchedule'), t('punchSuccess'));
        } catch (e) {
          if (e instanceof Error && e.message === 'LOCATION_PERMISSION_DENIED') {
            Alert.alert(t('tabSchedule'), t('clockPermissionDenied'));
            return;
          }
          const message = e instanceof ApiError ? e.message : t('punchFailed');
          Alert.alert(t('tabSchedule'), message);
        } finally {
          setPunchBusyId(null);
        }
        return;
      }

      setPunchBusyId(slotId);
      try {
        const r = await punchShift(slotId, selected, kind);
        if (!r.ok) {
          Alert.alert(t('tabSchedule'), r.message ?? t('punchFailed'));
          return;
        }
        Alert.alert(t('tabSchedule'), t('punchSuccess'));
      } finally {
        setPunchBusyId(null);
      }
    },
    [workSummariesByDate, selected, todayIso, selectedStoreId, loadDayPunches, punchShift, t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('scheduleWeekTitle'),
          headerBackTitle: t('tabSchedule'),
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView
        style={styles.pageScroll}
        alwaysBounceVertical
        contentContainerStyle={[
          styles.pageScrollContent,
          { paddingBottom: Math.max(24, insets.bottom + 16) },
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.selectedDateLine}>{selectedHeaderLine}</Text>
          {session?.user ? (
            session.user.stores.length > 1 ? (
              <Pressable
                hitSlop={8}
                onPress={() => setStorePickerVisible(true)}
                style={styles.storePickerBtn}
              >
                <Text style={styles.storePickerLabel} numberOfLines={1}>
                  {getActiveStore(session.user)?.name ?? ''}
                </Text>
                <View style={styles.storePickerIcon}>
                  <Ionicons color={colors.primary} name="chevron-down" size={16} />
                </View>
              </Pressable>
            ) : (
              <Text style={[styles.storePickerLabel, styles.storeNameOnly]} numberOfLines={1}>
                {getActiveStore(session.user)?.name}
              </Text>
            )
          ) : null}

          <View style={styles.weekBar}>
            <Pressable hitSlop={8} onPress={prevWeek} style={styles.weekChevron}>
              <Ionicons color={colors.primary} name="chevron-back" size={24} />
            </Pressable>
            <View style={styles.weekBarCenter}>
              <Text style={styles.weekRangeBold}>{weekNavLabels.rangeLine}</Text>
              <Text style={styles.weekMetaMuted}>{weekNavLabels.metaLine}</Text>
            </View>
            <Pressable hitSlop={8} onPress={nextWeek} style={styles.weekChevron}>
              <Ionicons color={colors.primary} name="chevron-forward" size={24} />
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={goToday}
              style={[styles.btnPrimary, !canSeeStore && styles.btnPrimaryFull]}
            >
              <Text style={styles.btnPrimaryText}>{t('scheduleGoToday')}</Text>
            </Pressable>
            {canSeeStore ? (
              <Pressable onPress={() => setMode((m) => (m === 'my' ? 'store' : 'my'))} style={styles.btnOutline}>
                <Text style={styles.btnOutlineText}>
                  {mode === 'my' ? t('scheduleViewStore') : t('scheduleViewMy')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.dayRow}>
          {days.map((d) => {
            const active = d.iso === selected;
            const weekdayIdx = (d.date.getDay() + 6) % 7;
            const hasWork = dayHasWork(
              d.iso,
              mode,
              myShiftsByDate,
              storeRosterByDate,
              fieldJobsByDate,
              storeFieldJobsByDate,
            );
            return (
              <Pressable
                key={d.iso}
                onPress={() => setSelected(d.iso)}
                style={[styles.dayCell, active && styles.dayCellActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  hasWork
                    ? `${weekdayAbbr[weekdayIdx] ?? ''} ${d.date.getDate()}, ${t('dayShiftOne')}`
                    : `${weekdayAbbr[weekdayIdx] ?? ''} ${d.date.getDate()}`
                }
              >
                <Text style={[styles.dayCellWeek, active && styles.dayCellWeekActive]} numberOfLines={1}>
                  {weekdayAbbr[weekdayIdx] ?? ''}
                </Text>
                <Text style={[styles.dayCellNum, active && styles.dayCellNumActive]}>{d.date.getDate()}</Text>
                {hasWork ? (
                  <View accessibilityRole="none" style={styles.workDotUnder} />
                ) : (
                  <View style={styles.workDotPlaceholder} />
                )}
              </Pressable>
            );
          })}
        </View>

        {mode === 'store' && canSeeStore ? <StoreRosterLegendBar t={t} /> : null}

      <View style={styles.panel}>
        {mode === 'store' ? (
          (storeScheduleLoading || storeFieldJobsLoading) && !storeDayHasContent ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.empty}>{t('scheduleLoading')}</Text>
            </View>
          ) : storeScheduleError ? (
            <View style={styles.emptyWrap}>
              <Ionicons color={colors.textMuted} name="alert-circle-outline" size={48} />
              <Text style={styles.empty}>{storeScheduleError}</Text>
              <Pressable onPress={() => void loadStoreSchedule()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>{t('retry')}</Text>
              </Pressable>
            </View>
          ) : !storeDayHasContent ? (
            <View style={styles.emptyWrap}>
              <Ionicons color={colors.textMuted} name="calendar-outline" size={48} />
              <Text style={styles.empty}>{t('storeDayRosterEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              <View style={styles.storeDayView}>
                {storeDayTimeline.map((entry, entryIndex) => {
                  if (entry.kind === 'field_job') {
                    return <StoreFieldJobCard key={`field-${entry.job.id}`} job={entry.job} />;
                  }
                  const sh = entry.shift;
                  return (
                    <View
                      key={`${entry.areaName}-${sh.shiftName}-${sh.range}-${sh.isSubstitution}-${entryIndex}`}
                      style={[
                        styles.storeRegionCard,
                        entryIndex > 0 && styles.storeTimelineCardGap,
                      ]}
                    >
                      <Text style={styles.storeRegionTitle}>{entry.areaName}</Text>
                      <View style={styles.storeShiftGroup}>
                        <View style={styles.storeShiftHead}>
                          <View style={styles.storeShiftLabelWrap}>
                            <Text style={styles.storeShiftLabel}>{sh.shiftName}</Text>
                            {sh.isSubstitution ? (
                              <View style={styles.storeShiftSubBadge}>
                                <Text style={styles.storeShiftSubBadgeText}>
                                  {t('scheduleSubstitutionBadge')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.storeShiftTime}>{sh.range}</Text>
                        </View>
                        {sh.isSubstitution && sh.originalDisplayName ? (
                          <Text style={styles.storeSubstitutionNote}>
                            {t('storeRosterReplaces', { name: sh.originalDisplayName })}
                          </Text>
                        ) : null}
                        <View style={styles.storeStaffWrap}>
                          {sh.staff.length === 0 ? (
                            <Text style={styles.storeStaffEmpty}>{t('storeChipNoAssignments')}</Text>
                          ) : (
                            sh.staff.map((staffEntry) => (
                              <StoreRosterStaffPill
                                key={`${entry.areaName}-${entryIndex}-${staffEntry.id}`}
                                entry={staffEntry}
                                t={t}
                              />
                            ))
                          )}
                        </View>
                        {entry.fieldJobs.length > 0 ? (
                          <View style={styles.storeNestedFieldJobs}>
                            {entry.fieldJobs.map((job) => (
                              <StoreFieldJobCard key={job.id} job={job} nested />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )
        ) : myScheduleLoading && myShifts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.empty}>{t('scheduleLoading')}</Text>
          </View>
        ) : myScheduleError ? (
          <View style={styles.emptyWrap}>
            <Ionicons color={colors.textMuted} name="alert-circle-outline" size={48} />
            <Text style={styles.empty}>{myScheduleError}</Text>
            <Pressable onPress={() => void loadMySchedule()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : myShifts.length === 0 && selectedFieldJobCount === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={48} />
            <Text style={styles.empty}>{t('noShifts')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {myShifts.map((s, slotIndex) => {
              const punch = getShiftPunch(selected, s);
              const pairPunch =
                s.overnightRole === 'end' && s.overnightPairCellId
                  ? shiftPunches.find((p) => p.scheduleId === s.overnightPairCellId)
                  : undefined;
              const missedPunchPendingStatus = getMissedPunchPendingStatus(
                myAttendanceRequests,
                selected,
                s,
              );
              const missedPunchOpen = getShiftMissedPunchOpenStatus(
                myAttendanceRequests,
                selected,
                s,
              );
              const leaveRequestStatus = getShiftLeaveRequestStatus(
                myAttendanceRequests,
                selected,
                s,
              );
              const leavePending = leaveRequestStatus !== 'none';
              const missedPunchBlockedByLeave = isMissedPunchBlockedByLeave(
                myAttendanceRequests,
                selected,
                s,
              );
              const shiftWorkDate = normalizeDateKeyOrToday(selected, getApproximateServerNowDate());
              const missedPunchTooEarly = !canApplyMissedPunchForShift(
                shiftWorkDate,
                s.range,
                punch,
                todayIso,
                getApproximateServerNowDate(),
                s.overnightRole ?? 'normal',
                pairPunch,
              );
              const missedPunchApplyBlocked =
                missedPunchPendingStatus === 'full' ||
                missedPunchBlockedByLeave ||
                missedPunchTooEarly;
              const leaveApplyBlocked =
                leavePending ||
                s.isSubstitution === true ||
                doesPunchCoverScheduledShift(punch, s.range) ||
                isShiftLeaveBlockedByMissedPunch(myAttendanceRequests, selected, s, s.range);
              const openApply = (type: 'missed_punch' | 'leave') => {
                setRequestScheduleContext({ workDate: selected, slots: myShifts });
                openShiftRequest({ type, workDate: selected, slots: myShifts, slotIndex });
              };
              return (
                <View key={s.id} style={styles.shiftGroup}>
                  <MyShiftCard
                    slot={s}
                    workDateIso={selected}
                    todayIso={todayIso}
                    punch={punch}
                    pairPunch={pairPunch}
                    punchesKnown={punchesKnown}
                    punchBusy={punchBusyId === s.id}
                    missedPunchApplyBlocked={missedPunchApplyBlocked}
                    missedPunchPendingStatus={missedPunchPendingStatus}
                    missedPunchOpen={missedPunchOpen}
                    leaveRequestStatus={leaveRequestStatus}
                    leaveApplyBlocked={leaveApplyBlocked}
                    onClockIn={() => void runPunch(s.id, 'in')}
                    onClockOut={() => void runPunch(s.id, 'out')}
                    onApplyMissed={() => {
                      if (missedPunchTooEarly) {
                        Alert.alert(t('typeMissedPunch'), t('missedPunchBeforePunchTime'));
                        return;
                      }
                      if (missedPunchBlockedByLeave) {
                        Alert.alert(t('typeMissedPunch'), t('missedPunchBlockedByLeave'));
                        return;
                      }
                      if (missedPunchApplyBlocked) {
                        Alert.alert(t('typeMissedPunch'), t('missedPunchAlreadyPending'));
                        return;
                      }
                      openApply('missed_punch');
                    }}
                    onApplyLeave={() => {
                      if (leavePending) {
                        Alert.alert(t('typeLeave'), t('leaveShiftAlreadyPending'));
                        return;
                      }
                      if (leaveApplyBlocked) {
                        Alert.alert(t('typeLeave'), t('leaveShiftPunchCovered'));
                        return;
                      }
                      openApply('leave');
                    }}
                  />
                  {(selectedFieldGroups.byShiftId[s.id] ?? []).map((job) => (
                    <FieldJobRow
                      key={job.id || `${s.id}-field-${job.start}`}
                      job={job}
                      nested
                      workDateIso={selected}
                      attendanceRequests={myAttendanceRequests}
                    />
                  ))}
                </View>
              );
            })}
            {selectedFieldGroups.standalone.length > 0 ? (
              <View style={styles.fieldJobsSection}>
                {selectedFieldGroups.standalone.map((job) => (
                  <FieldJobRow
                    key={job.id || `standalone-${job.start}`}
                    job={job}
                    workDateIso={selected}
                    attendanceRequests={myAttendanceRequests}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
      </ScrollView>
      <Modal
        transparent
        visible={storePickerVisible}
        animationType="fade"
        onRequestClose={() => setStorePickerVisible(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStorePickerVisible(false)}
            style={styles.modalBackdropFill}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('storePickerTitle')}</Text>
            {session?.user.stores.map((s) => {
              const active = s.id === session.user.selectedStoreId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    void setSelectedStore(s.id).then(() => {
                      setStorePickerVisible(false);
                    });
                  }}
                  style={[styles.modalRow, active && styles.modalRowActive]}
                >
                  <Text style={styles.modalRowText} numberOfLines={2}>
                    {s.name}
                  </Text>
                  {active ? <Ionicons color={colors.primaryDark} name="checkmark-circle" size={22} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pageScroll: { flex: 1 },
  pageScrollContent: { flexGrow: 1 },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  selectedDateLine: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  storePickerBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '88%',
  },
  storeNameOnly: { marginTop: 6, alignSelf: 'flex-start', maxWidth: '88%' },
  storePickerLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.textMuted,
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false, textAlignVertical: 'center' as const }
      : {}),
  },
  storePickerIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    gap: 4,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  modalRowActive: { backgroundColor: colors.primarySoft },
  modalRowText: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  weekBar: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weekChevron: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBarCenter: { flex: 1, alignItems: 'center' },
  weekRangeBold: { fontSize: 17, fontWeight: '800', color: colors.text },
  weekMetaMuted: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.textMuted },
  actionRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryFull: { flex: 1 },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  dayRow: {
    flexShrink: 0,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
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
  workDotUnder: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  workDotPlaceholder: { marginTop: 4, height: 5 },
  panel: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  list: { gap: 12, paddingBottom: 24 },
  shiftGroup: { gap: 8 },
  fieldJobsSection: { gap: 10, marginTop: 4 },
  fieldJobsSectionTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 4 },
  storeDayView: { gap: 14 },
  storeTimelineCardGap: { marginTop: 0 },
  storeNestedFieldJobs: { gap: 8, marginTop: 4 },
  storeRegionCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  storeRegionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  storeShiftGroup: {
    gap: 8,
  },
  storeShiftGroupBorder: {
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  storeShiftHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  storeShiftLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  storeShiftLabel: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  storeShiftSubBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  storeShiftSubBadgeText: { fontSize: 10, fontWeight: '800', color: '#6d28d9' },
  storeSubstitutionNote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6d28d9',
    marginTop: -2,
  },
  storeShiftTime: { fontSize: 13, fontWeight: '600', color: colors.primaryDark, flex: 1, textAlign: 'right' },
  storeStaffWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeStaffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: '100%',
  },
  storeStaffPillNormal: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  storeStaffPillSubstitution: {
    backgroundColor: '#f3e8ff',
    borderColor: '#7c3aed',
  },
  storeStaffPillOnLeave: {
    backgroundColor: '#FEF3C7',
    borderColor: colors.warning,
  },
  storeStaffText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  storeStaffTextNormal: { color: colors.primaryDark },
  storeStaffTextSubstitution: { color: '#6d28d9' },
  storeStaffTextOnLeave: { color: '#B45309' },
  storeStaffBadgeSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6d28d9',
    flexShrink: 0,
  },
  storeStaffBadgeLeave: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    flexShrink: 0,
  },
  storeStaffEmpty: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  storeRosterLegendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 6,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
  },
  storeRosterLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storeRosterLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  storeRosterLegendDotNormal: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  storeRosterLegendDotSubstitution: {
    backgroundColor: '#f3e8ff',
    borderColor: '#7c3aed',
  },
  storeRosterLegendDotOnLeave: {
    backgroundColor: '#FEF3C7',
    borderColor: colors.warning,
  },
  storeRosterLegendText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  cardTimeHero: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  cardMetaLbl: {
    marginTop: 14,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  cardMetaLblAfter: { marginTop: 10 },
  cardMetaVal: { marginTop: 3, fontSize: 13, fontWeight: '500', color: colors.textMuted, lineHeight: 18 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  badgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
