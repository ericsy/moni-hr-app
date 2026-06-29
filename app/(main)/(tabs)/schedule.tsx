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
import { fetchTodayWorkSummary } from '../../../src/api/todayWork';
import { FieldJobRow } from '../../../src/components/FieldJobRow';
import { SchedulePunchHeroCard } from '../../../src/components/SchedulePunchHeroCard';
import { TodayShiftRow } from '../../../src/components/TodayShiftRow';
import { getActiveStore, useAuth } from '../../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../../src/hooks/useRefreshOnAppForeground';
import { colors } from '../../../src/theme/colors';
import { calendarDateKey, normalizeDateKeyOrToday } from '../../../src/utils/calendarDateKey';
import { formatSelectedHeaderLine } from '../../../src/utils/localeDateFormat';
import {
  getShiftLeaveRequestStatus,
  isMissedPunchBlockedByLeave,
} from '../../../src/utils/leaveRequestEligibility';
import {
  getMissedPunchPendingStatus,
  isShiftLeaveBlockedByMissedPunch,
} from '../../../src/utils/missedPunchEligibility';
import { openShiftRequest } from '../../../src/utils/openShiftRequest';
import { countPendingApprovals, shouldSplitRequestViews } from '../../../src/utils/requestApproval';
import { pickHeroShiftIndex } from '../../../src/utils/scheduleHeroShift';
import { canApplyMissedPunchForShift, getShiftCardActions } from '../../../src/utils/shiftClockWindow';
import { doesPunchCoverScheduledShift } from '../../../src/utils/shiftLeaveEligibility';
import { getApproximateServerNowDate } from '../../../src/utils/serverClock';
import { resolveFieldJobsForSchedule } from '../../../src/utils/fieldJobsSchedule';
import type { TimelineFieldJobItem, TodayWorkSummary, TodayWorkTimelineItem } from '../../../src/types/fieldService';
import {
  executeWorkPunch,
  isWorkPunchActionEnabled,
} from '../../../src/utils/workPunch';

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
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

  const todayIso = calendarDateKey(getApproximateServerNowDate());
  const todayDate = useMemo(() => parseIsoToLocalDate(todayIso), [todayIso]);
  const dateLang = language ?? i18n.language;
  const selectedHeaderLine = useMemo(
    () => formatSelectedHeaderLine(todayDate, dateLang),
    [todayDate, dateLang],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [todayShifts, setTodayShifts] = useState<MyPublishedShiftSlot[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [punchBusyId, setPunchBusyId] = useState<string | null>(null);
  const [fieldJobsByShiftId, setFieldJobsByShiftId] = useState<Record<string, TimelineFieldJobItem[]>>({});
  const [standaloneFieldJobs, setStandaloneFieldJobs] = useState<TimelineFieldJobItem[]>([]);
  const [fieldTimeline, setFieldTimeline] = useState<TodayWorkTimelineItem[]>([]);
  const [workSummary, setWorkSummary] = useState<TodayWorkSummary | null>(null);

  const selectedStoreId = session?.user?.selectedStoreId ?? '';
  const punchesKnown = isShiftPunchDateLoaded(todayIso);

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

  const getPairPunch = useCallback(
    (slot: MyPublishedShiftSlot) => {
      if (slot.overnightRole === 'end' && slot.overnightPairCellId) {
        return shiftPunches.find((p) => p.scheduleId === slot.overnightPairCellId);
      }
      return undefined;
    },
    [shiftPunches],
  );

  const loadTodaySchedule = useCallback(async () => {
    if (!selectedStoreId) {
      setTodayShifts([]);
      return;
    }
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const data = await fetchMyPublishedSchedule({
        storeId: selectedStoreId,
        from: todayIso,
        to: todayIso,
      });
      const grouped = groupPublishedScheduleByDate(data.items ?? []);
      const slots = grouped[todayIso] ?? [];
      setTodayShifts(slots);
      mergePublishedSchedule(grouped);
    } catch (e) {
      setTodayShifts([]);
      const message = e instanceof ApiError ? e.message : t('scheduleLoadFailed');
      setScheduleError(message);
    } finally {
      setScheduleLoading(false);
    }
  }, [selectedStoreId, todayIso, t, mergePublishedSchedule]);

  const loadTodayFieldJobs = useCallback(async () => {
    if (!selectedStoreId) {
      setFieldTimeline([]);
      setWorkSummary(null);
      return;
    }
    try {
      const summary = await fetchTodayWorkSummary({ storeId: selectedStoreId, date: todayIso });
      setWorkSummary(summary);
      setFieldTimeline(summary.timeline);
    } catch {
      setFieldTimeline([]);
      setWorkSummary(null);
    }
  }, [selectedStoreId, todayIso]);

  useEffect(() => {
    const resolved = resolveFieldJobsForSchedule(todayShifts, fieldTimeline);
    setFieldJobsByShiftId(resolved.fieldJobsByShiftId);
    setStandaloneFieldJobs(resolved.standaloneFieldJobs);
  }, [todayShifts, fieldTimeline]);

  const totalFieldJobs = useMemo(() => {
    const nested = Object.values(fieldJobsByShiftId).flat();
    return nested.length + standaloneFieldJobs.length;
  }, [fieldJobsByShiftId, standaloneFieldJobs]);

  const loadTodayPunches = useCallback(async () => {
    if (!selectedStoreId) return;
    await refreshShiftPunchesForDate(todayIso);
    for (const s of todayShifts) {
      if (s.overnightRole === 'end' && s.overnightPairCellId) {
        const [y, m, d] = todayIso.split('-').map(Number);
        const prev = new Date(y, m - 1, d);
        prev.setDate(prev.getDate() - 1);
        const prevIso = calendarDateKey(prev);
        await refreshShiftPunchesForDate(prevIso);
      }
    }
  }, [selectedStoreId, todayIso, todayShifts, refreshShiftPunchesForDate]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void refreshAttendanceRequests();
  }, [session?.user?.selectedStoreId, refreshAttendanceRequests]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadTodaySchedule();
  }, [session?.user, selectedStoreId, loadTodaySchedule]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadTodayFieldJobs();
  }, [session?.user, selectedStoreId, loadTodayFieldJobs]);

  useEffect(() => {
    if (!session?.user || !selectedStoreId) return;
    void loadTodayPunches();
  }, [session?.user, selectedStoreId, todayShifts, loadTodayPunches]);

  const heroIndex = useMemo(
    () =>
      pickHeroShiftIndex(
        todayShifts,
        todayIso,
        todayIso,
        (s) => getShiftPunch(todayIso, s),
        getPairPunch,
        punchesKnown,
      ),
    [todayShifts, todayIso, getShiftPunch, getPairPunch, punchesKnown, shiftPunches],
  );

  const heroSlot = heroIndex >= 0 ? todayShifts[heroIndex] : undefined;
  const workAction = workSummary?.currentPunchAction;
  const showHeroCard =
    !!heroSlot ||
    isWorkPunchActionEnabled(workAction) ||
    workAction?.action === 'WAITING' ||
    workAction?.action === 'DONE';

  const runPunch = useCallback(
    async (slot: MyPublishedShiftSlot) => {
      const punch = getShiftPunch(todayIso, slot);
      const pairPunch = getPairPunch(slot);
      const actions = getShiftCardActions(
        todayIso,
        slot.range,
        punch,
        todayIso,
        getApproximateServerNowDate(),
        punchesKnown,
        slot.overnightRole ?? 'normal',
        pairPunch,
      );
      const kind = actions.showClockOut ? 'out' : 'in';

      setPunchBusyId(slot.id);
      try {
        const r = await punchShift(slot.id, todayIso, kind);
        if (!r.ok) {
          Alert.alert(t('tabSchedule'), r.message ?? t('punchFailed'));
          return;
        }
        Alert.alert(t('tabSchedule'), t('punchSuccess'));
      } finally {
        setPunchBusyId(null);
      }
    },
    [getShiftPunch, getPairPunch, todayIso, punchesKnown, punchShift, t],
  );

  const onHeroPunch = useCallback(async () => {
    const action = workSummary?.currentPunchAction;
    if (isWorkPunchActionEnabled(action) && action && selectedStoreId) {
      setPunchBusyId('work');
      try {
        const summary = await executeWorkPunch({ storeId: selectedStoreId, action });
        setWorkSummary(summary);
        setFieldTimeline(summary.timeline);
        await loadTodayPunches();
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
    if (heroSlot) {
      await runPunch(heroSlot);
    }
  }, [workSummary, selectedStoreId, loadTodayPunches, t, heroSlot, runPunch]);

  const refreshPageData = useCallback(async () => {
    await Promise.all([
      refreshCurrentEmployee(),
      loadTodaySchedule(),
      loadTodayFieldJobs(),
      loadTodayPunches(),
      refreshAttendanceRequests(),
    ]);
  }, [
    refreshCurrentEmployee,
    loadTodaySchedule,
    loadTodayFieldJobs,
    loadTodayPunches,
    refreshAttendanceRequests,
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

  const openApply = useCallback(
    (slotIndex: number, type: 'missed_punch' | 'leave') => {
      setRequestScheduleContext({ workDate: todayIso, slots: todayShifts });
      openShiftRequest({ type, workDate: todayIso, slots: todayShifts, slotIndex });
    },
    [todayShifts, todayIso, setRequestScheduleContext],
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
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('tabSchedule')}</Text>
            <View style={styles.headerArt} pointerEvents="none">
              <Ionicons color={colors.primarySoft} name="calendar" size={56} />
              <View style={styles.headerArtClock}>
                <Ionicons color={colors.primary} name="time" size={22} />
              </View>
            </View>
          </View>
          <View style={styles.headerQuickLinks}>
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push({ pathname: '/punch-records', params: { date: todayIso } })}
              style={({ pressed }) => [styles.headerQuickLink, pressed && styles.headerQuickLinkPressed]}
            >
              <Ionicons color={colors.primary} name="time-outline" size={16} />
              <Text style={styles.headerQuickLinkText}>{t('punchRecordsTitle')}</Text>
              <Ionicons color={colors.primary} name="chevron-forward" size={14} />
            </Pressable>
            <Pressable
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

          <View style={styles.metaRow}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={16} />
            <Text style={styles.selectedDateLine}>{selectedHeaderLine}</Text>
          </View>
          {session?.user ? (
            <View style={styles.storeRow}>
              <Ionicons color={colors.textMuted} name="business-outline" size={16} />
              {session.user.stores.length > 1 ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => setStorePickerVisible(true)}
                  style={styles.storePickerBtn}
                >
                  <Text style={styles.storePickerLabel} numberOfLines={1}>
                    {getActiveStore(session.user)?.name ?? ''}
                  </Text>
                  <Ionicons color={colors.primary} name="chevron-down" size={14} />
                </Pressable>
              ) : (
                <Text style={styles.storePickerLabel} numberOfLines={1}>
                  {getActiveStore(session.user)?.name}
                </Text>
              )}
            </View>
          ) : null}
        </View>

        {scheduleLoading && todayShifts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.empty}>{t('scheduleLoading')}</Text>
          </View>
        ) : scheduleError ? (
          <View style={styles.emptyWrap}>
            <Ionicons color={colors.textMuted} name="alert-circle-outline" size={48} />
            <Text style={styles.empty}>{scheduleError}</Text>
            <Pressable onPress={() => void loadTodaySchedule()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : showHeroCard ? (
          <SchedulePunchHeroCard
            key={heroSlot?.id ?? 'work-hero'}
            slot={heroSlot}
            workDateIso={todayIso}
            todayIso={todayIso}
            punch={heroSlot ? getShiftPunch(todayIso, heroSlot) : undefined}
            pairPunch={heroSlot ? getPairPunch(heroSlot) : undefined}
            punchesKnown={punchesKnown}
            punchBusy={punchBusyId === 'work' || (heroSlot ? punchBusyId === heroSlot.id : false)}
            workAction={workAction}
            onPunch={onHeroPunch}
          />
        ) : null}

        <View style={styles.todayPanel}>
          <View style={styles.todayPanelHead}>
            <View style={styles.todayPanelBar} />
            <Text style={styles.todayPanelTitle}>{t('todayShiftsTitle')}</Text>
          </View>
          {todayShifts.length === 0 && totalFieldJobs === 0 && !scheduleLoading ? (
            <View style={styles.todayEmpty}>
              <Text style={styles.todayEmptyText}>{t('noShiftsToday')}</Text>
            </View>
          ) : (
            <View style={styles.todayList}>
              {todayShifts.map((s, slotIndex) => {
                const punch = getShiftPunch(todayIso, s);
                const pairPunch = getPairPunch(s);
                const missedPunchPendingStatus = getMissedPunchPendingStatus(
                  myAttendanceRequests,
                  todayIso,
                  s,
                );
                const leaveRequestStatus = getShiftLeaveRequestStatus(
                  myAttendanceRequests,
                  todayIso,
                  s,
                );
                const leavePending = leaveRequestStatus !== 'none';
                const missedPunchBlockedByLeave = isMissedPunchBlockedByLeave(
                  myAttendanceRequests,
                  todayIso,
                  s,
                );
                const shiftWorkDate = normalizeDateKeyOrToday(todayIso, getApproximateServerNowDate());
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
                  isShiftLeaveBlockedByMissedPunch(myAttendanceRequests, todayIso, s, s.range);
                return (
                  <View key={s.id} style={styles.shiftGroup}>
                    <TodayShiftRow
                      slot={s}
                      index={slotIndex}
                      workDateIso={todayIso}
                      todayIso={todayIso}
                      punch={punch}
                      pairPunch={pairPunch}
                      punchesKnown={punchesKnown}
                      leaveRequestStatus={leaveRequestStatus}
                      missedPunchApplyBlocked={missedPunchApplyBlocked}
                      leaveApplyBlocked={leaveApplyBlocked}
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
                        openApply(slotIndex, 'missed_punch');
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
                        openApply(slotIndex, 'leave');
                      }}
                    />
                    {(fieldJobsByShiftId[s.id] ?? []).map((job) => (
                      <FieldJobRow key={job.id || `${s.id}-field-${job.start}`} job={job} nested />
                    ))}
                  </View>
                );
              })}
              {standaloneFieldJobs.length > 0 ? (
                <View style={styles.fieldJobsSection}>
                  {todayShifts.length > 0 ? (
                    <Text style={styles.fieldJobsSectionTitle}>{t('scheduleFieldJobsTitle')}</Text>
                  ) : null}
                  {standaloneFieldJobs.map((job) => (
                    <FieldJobRow key={job.id || `standalone-${job.start}`} job={job} />
                  ))}
                </View>
              ) : null}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/schedule-week', params: { date: todayIso } })}
            style={({ pressed }) => [styles.viewMoreLink, pressed && styles.viewMoreLinkPressed]}
          >
            <Ionicons color={colors.primary} name="calendar-outline" size={16} />
            <Text style={styles.viewMoreText}>{t('scheduleViewMore')}</Text>
            <Ionicons color={colors.primary} name="chevron-forward" size={16} />
          </Pressable>
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
  headerBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, flex: 1 },
  headerArt: { width: 64, height: 56, alignItems: 'center', justifyContent: 'center' },
  headerArtClock: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  headerQuickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    columnGap: 16,
    rowGap: 4,
  },
  headerQuickLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  headerQuickLinkPressed: { opacity: 0.65 },
  headerQuickLinkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  selectedDateLine: { fontSize: 14, fontWeight: '600', color: colors.textMuted, flex: 1 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  storePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    maxWidth: '88%',
  },
  storePickerLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false, textAlignVertical: 'center' as const }
      : {}),
  },
  todayPanel: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 14,
  },
  todayPanelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  todayPanelBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary },
  todayPanelTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  fieldJobsSection: { gap: 10, marginTop: 4 },
  fieldJobsSectionTitle: { fontSize: 13, fontWeight: '800', color: '#7C3AED', marginTop: 4 },
  todayList: { gap: 10 },
  shiftGroup: { gap: 0 },
  todayEmpty: { paddingVertical: 24, alignItems: 'center' },
  todayEmptyText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  viewMoreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  viewMoreLinkPressed: { opacity: 0.65 },
  viewMoreText: { fontSize: 14, fontWeight: '700', color: colors.primary },
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
});
