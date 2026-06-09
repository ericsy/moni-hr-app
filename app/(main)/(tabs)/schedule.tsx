import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

import { ApiError } from '../../../src/api/client';
import {
  groupPublishedScheduleByDate,
  type MyPublishedShiftSlot,
} from '../../../src/api/mapPublishedSchedule';
import { fetchMyPublishedSchedule } from '../../../src/api/schedule';
import { MyShiftCard } from '../../../src/components/MyShiftCard';
import { type RegionKey, type ShiftKey } from '../../../src/data/demoMyShifts';
import { getActiveStore, useAuth } from '../../../src/context/AuthContext';
import {
  getShiftLeaveRequestStatus,
  hasOpenLeaveForShift,
  isMissedPunchBlockedByLeave,
} from '../../../src/utils/leaveRequestEligibility';
import {
  getMissedPunchPendingStatus,
  getShiftMissedPunchOpenStatus,
  isShiftLeaveBlockedByMissedPunch,
} from '../../../src/utils/missedPunchEligibility';
import { doesPunchCoverScheduledShift } from '../../../src/utils/shiftLeaveEligibility';
import { canApplyMissedPunchForShift } from '../../../src/utils/shiftClockWindow';
import { openShiftRequest } from '../../../src/utils/openShiftRequest';
import { colors } from '../../../src/theme/colors';
import { calendarDateKey, normalizeDateKeyOrToday } from '../../../src/utils/calendarDateKey';
import { useRefreshOnAppForeground } from '../../../src/hooks/useRefreshOnAppForeground';
import { getApproximateServerNowDate } from '../../../src/utils/serverClock';
import { countPendingApprovals, shouldSplitRequestViews } from '../../../src/utils/requestApproval';
import { canViewStoreRoster } from '../../../src/utils/storeManagement';
import {
  formatSelectedHeaderLine,
  weekNavigatorLabels,
} from '../../../src/utils/localeDateFormat';

/** 排班最小单元：区域 + 班次 + 时段；店铺视图下含员工 */
type ScheduleSlot = {
  region: RegionKey;
  shiftKey: ShiftKey;
  range: string;
  staffName?: string;
  storeId?: string;
};

/** 店铺日视图：区域 → 多个班次；每班次含时段与多名员工 */
type StoreDayShiftGroup = {
  shiftKey: ShiftKey;
  range: string;
  staffNames: string[];
};

type StoreDayRegionGroup = {
  region: RegionKey;
  shifts: StoreDayShiftGroup[];
};

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

/**
 * 演示：按门店、按日 — 区域下多班次，每班次多员工；API 可返回同等结构。
 */
const STORE_DAY_ROSTER_BY_STORE: Record<string, Record<string, StoreDayRegionGroup[]>> = {
  'store-akl': {
  '2026-05-12': [
    {
      region: 'regionFoH',
      shifts: [
        { shiftKey: 'shiftOpen', range: '08:30–12:30', staffNames: ['Sam Li', 'Mia Wu'] },
        { shiftKey: 'shiftMid', range: '11:00–15:00', staffNames: ['Jordan Ng'] },
        { shiftKey: 'shiftClose', range: '17:00–22:00', staffNames: ['Riley Zhang', 'Alex Chen'] },
      ],
    },
    {
      region: 'regionBoH',
      shifts: [
        { shiftKey: 'shiftMid', range: '12:00–18:00', staffNames: ['Pat Kim', 'Chris Wang'] },
      ],
    },
    {
      region: 'regionWhs',
      shifts: [{ shiftKey: 'shiftOpen', range: '09:00–14:00', staffNames: ['Lin Han'] }],
    },
  ],
  '2026-05-13': [
    {
      region: 'regionFoH',
      shifts: [
        { shiftKey: 'shiftOpen', range: '08:00–12:30', staffNames: ['Sam Li'] },
        { shiftKey: 'shiftClose', range: '16:00–22:00', staffNames: ['Jordan Ng'] },
      ],
    },
    {
      region: 'regionBoH',
      shifts: [{ shiftKey: 'shiftClose', range: '17:00–22:00', staffNames: ['Alex Chen'] }],
    },
  ],
  '2026-05-14': [
    {
      region: 'regionFoH',
      shifts: [{ shiftKey: 'shiftClose', range: '16:00–21:30', staffNames: ['Mia Wu', 'Riley Zhang'] }],
    },
  ],
  '2026-05-15': [
    {
      region: 'regionWhs',
      shifts: [
        { shiftKey: 'shiftOpen', range: '09:00–14:00', staffNames: ['Lin Han'] },
        { shiftKey: 'shiftMid', range: '12:00–17:00', staffNames: ['Chris Wang'] },
      ],
    },
  ],
  '2026-05-16': [
    {
      region: 'regionBoH',
      shifts: [{ shiftKey: 'shiftMid', range: '12:00–18:00', staffNames: ['Pat Kim'] }],
    },
    {
      region: 'regionFoH',
      shifts: [{ shiftKey: 'shiftMid', range: '12:00–18:00', staffNames: ['Sam Li', 'Alex Chen'] }],
    },
  ],
  '2026-05-17': [],
  '2026-05-18': [
    {
      region: 'regionFoH',
      shifts: [
        { shiftKey: 'shiftOpen', range: '08:00–12:00', staffNames: ['Mia Wu', 'Jordan Ng', 'Riley Zhang'] },
      ],
    },
  ],
  },
  'store-chc': {
    '2026-05-12': [
      {
        region: 'regionFoH',
        shifts: [
          { shiftKey: 'shiftOpen', range: '10:00–14:00', staffNames: ['Taylor Reed', 'Casey Ho'] },
        ],
      },
    ],
    '2026-05-14': [
      {
        region: 'regionFoH',
        shifts: [{ shiftKey: 'shiftClose', range: '16:00–21:30', staffNames: ['Mia Wu', 'Riley Zhang'] }],
      },
    ],
    '2026-05-16': [
      {
        region: 'regionBoH',
        shifts: [{ shiftKey: 'shiftMid', range: '12:00–18:00', staffNames: ['Pat Kim', 'Quinn Lee'] }],
      },
    ],
    '2026-05-17': [],
  },
};

function getStoreDayRoster(iso: string, storeId: string): StoreDayRegionGroup[] {
  return STORE_DAY_ROSTER_BY_STORE[storeId]?.[iso] ?? [];
}

function dayHasWork(
  iso: string,
  mode: 'my' | 'store',
  storeId: string,
  myShiftsByDate: Record<string, MyPublishedShiftSlot[]>,
): boolean {
  if (mode === 'my') {
    return (myShiftsByDate[iso]?.length ?? 0) > 0;
  }
  const roster = getStoreDayRoster(iso, storeId);
  return roster.some((rg) => rg.shifts.length > 0);
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    session,
    language,
    setSelectedStore,
    myAttendanceRequests,
    approvalAttendanceRequests,
    selectedStoreHasStoreManager,
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
  const pendingRequestCount = useMemo(() => {
    const user = session?.user;
    const storeId = user?.selectedStoreId;
    if (!user || !storeId) return 0;
    const hint = { storeHasStoreManager: selectedStoreHasStoreManager };
    if (shouldSplitRequestViews(user, storeId, approvalAttendanceRequests, hint)) {
      return countPendingApprovals(approvalAttendanceRequests);
    }
    return myAttendanceRequests.filter((r) => r.status === 'pending').length;
  }, [session?.user, selectedStoreHasStoreManager, approvalAttendanceRequests, myAttendanceRequests]);

  useEffect(() => {
    if (!session?.user?.selectedStoreId) return;
    void refreshAttendanceRequests();
  }, [session?.user?.selectedStoreId, refreshAttendanceRequests]);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(getApproximateServerNowDate()));
  const [selected, setSelected] = useState(() => calendarDateKey(getApproximateServerNowDate()));
  const [mode, setMode] = useState<'my' | 'store'>('my');
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [myShiftsByDate, setMyShiftsByDate] = useState<Record<string, MyPublishedShiftSlot[]>>({});
  const [myScheduleLoading, setMyScheduleLoading] = useState(false);
  const [myScheduleError, setMyScheduleError] = useState<string | null>(null);
  const [punchBusyId, setPunchBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadMySchedule();
  }, [session?.user, selectedStoreId, loadMySchedule]);

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
  const storeDayRoster = useMemo(
    () => getStoreDayRoster(selected, selectedStoreId),
    [selected, selectedStoreId],
  );
  const todayIso = calendarDateKey(getApproximateServerNowDate());
  const punchesKnown = isShiftPunchDateLoaded(selected);

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
    await Promise.all([
      refreshCurrentEmployee(),
      loadMySchedule(),
      loadDayPunches(),
      refreshAttendanceRequests(),
    ]);
  }, [refreshCurrentEmployee, loadMySchedule, loadDayPunches, refreshAttendanceRequests]);

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
    [punchShift, selected, t],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
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
          <Text style={styles.title}>{t('tabSchedule')}</Text>
          <View style={styles.headerQuickLinks}>
            <Pressable
              accessibilityLabel={t('punchRecordsTitle')}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() =>
                router.push({ pathname: '/punch-records', params: { date: selected } })
              }
              style={({ pressed }) => [styles.headerQuickLink, pressed && styles.headerQuickLinkPressed]}
            >
              <Ionicons color={colors.primary} name="time-outline" size={16} />
              <Text style={styles.headerQuickLinkText}>{t('punchRecordsTitle')}</Text>
              <Ionicons color={colors.primary} name="chevron-forward" size={14} />
            </Pressable>
            <Pressable
              accessibilityLabel={t('requestsRecords')}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push('/requests')}
              style={({ pressed }) => [styles.headerQuickLink, pressed && styles.headerQuickLinkPressed]}
            >
              <Ionicons color={colors.primary} name="clipboard-outline" size={16} />
              <Text style={styles.headerQuickLinkText}>{t('requestsRecords')}</Text>
              {pendingRequestCount > 0 ? (
                <View style={styles.requestsBadgeInline}>
                  <Text style={styles.requestsBadgeText}>
                    {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                  </Text>
                </View>
              ) : null}
              <Ionicons color={colors.primary} name="chevron-forward" size={14} />
            </Pressable>
          </View>
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
            const hasWork = dayHasWork(d.iso, mode, selectedStoreId, myShiftsByDate);
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

      <View style={styles.panel}>
        {mode === 'store' ? (
          <View style={styles.list}>
            {!canSeeStore ? (
              <View style={styles.previewBanner}>
                <Text style={styles.previewBannerText}>{t('storeSchedulePreviewNote')}</Text>
              </View>
            ) : null}
            {storeDayRoster.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons color={colors.textMuted} name="calendar-outline" size={48} />
                <Text style={styles.empty}>{t('storeDayRosterEmpty')}</Text>
              </View>
            ) : (
              <View style={styles.storeDayView}>
                {storeDayRoster.map((rg) => (
                  <View key={rg.region} style={styles.storeRegionCard}>
                    <Text style={styles.storeRegionTitle}>{t(rg.region)}</Text>
                    {rg.shifts.map((sh, si) => (
                      <View
                        key={`${rg.region}-${sh.shiftKey}-${sh.range}-${si}`}
                        style={[styles.storeShiftGroup, si > 0 && styles.storeShiftGroupBorder]}
                      >
                        <View style={styles.storeShiftHead}>
                          <Text style={styles.storeShiftLabel}>{t(sh.shiftKey)}</Text>
                          <Text style={styles.storeShiftTime}>{sh.range}</Text>
                        </View>
                        <View style={styles.storeStaffWrap}>
                          {sh.staffNames.map((name, ni) => (
                            <View
                              key={`${rg.region}-${si}-${name}-${ni}`}
                              style={styles.storeStaffPill}
                            >
                              <Text style={styles.storeStaffText} numberOfLines={1}>
                                {name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
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
        ) : myShifts.length === 0 ? (
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
                <MyShiftCard
                  key={s.id}
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
              );
            })}
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
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  headerQuickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    columnGap: 16,
    rowGap: 4,
  },
  headerQuickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  headerQuickLinkPressed: { opacity: 0.65 },
  headerQuickLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  requestsBadgeInline: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  selectedDateLine: {
    marginTop: 8,
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
  storeDayView: { gap: 14 },
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
  storeShiftLabel: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 0 },
  storeShiftTime: { fontSize: 13, fontWeight: '600', color: colors.primaryDark, flex: 1, textAlign: 'right' },
  storeStaffWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeStaffPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  storeStaffText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  previewBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewBannerText: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, fontWeight: '600' },
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
