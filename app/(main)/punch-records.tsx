import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import { fetchClockPunchesByDay } from '../../src/api/clock';
import { buildShiftPunchGroups, type ShiftPunchGroup } from '../../src/api/groupPunchesByShift';
import {
  groupPublishedScheduleByDate,
  type MyPublishedShiftSlot,
} from '../../src/api/mapPublishedSchedule';
import { fetchMyPublishedSchedule } from '../../src/api/schedule';
import type { AppClockPunchResult } from '../../src/api/types';
import { getActiveStore, useAuth } from '../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { colors } from '../../src/theme/colors';
import { calendarDateKey } from '../../src/utils/calendarDateKey';
import { formatPunchHeaderDate, formatPunchHm } from '../../src/utils/formatPunchTime';
import { getApproximateServerNowDate } from '../../src/utils/serverClock';
import { formatShiftHeroName } from '../../src/utils/scheduleHeroShift';
import {
  formatFieldJobPunchTitle,
  formatPunchTaskTypeLabel,
  isFieldJobPunchGroup,
  isLikelyFieldJobPunch,
} from '../../src/utils/punchTaskType';

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

export default function PunchRecordsScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ date?: string }>();
  const {
    session,
    language,
    publishedScheduleByDate,
    mergePublishedSchedule,
    refreshShiftPunchesForDate,
  } = useAuth();

  const initialDate =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(params.date)
      ? params.date.slice(0, 10)
      : calendarDateKey(getApproximateServerNowDate());

  const [selected, setSelected] = useState(initialDate);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(parseIsoToLocalDate(initialDate)));
  const [punches, setPunches] = useState<AppClockPunchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStoreId = session?.user?.selectedStoreId ?? '';
  const storeName = session?.user ? (getActiveStore(session.user)?.name ?? '') : '';

  const weekEndIso = useMemo(() => calendarDateKey(addDays(weekStart, 6)), [weekStart]);
  const weekStartIso = useMemo(() => calendarDateKey(weekStart), [weekStart]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { iso: calendarDateKey(d), date: d };
    });
  }, [weekStart]);

  const weekdayAbbr = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  const daySlots: MyPublishedShiftSlot[] = useMemo(
    () => publishedScheduleByDate[selected] ?? [],
    [publishedScheduleByDate, selected],
  );

  const shiftGroups = useMemo(
    () => buildShiftPunchGroups(daySlots, punches, selected),
    [daySlots, punches, selected],
  );

  const hasAnyContent = shiftGroups.length > 0;

  const loadWeekSchedule = useCallback(async () => {
    if (!selectedStoreId) return;
    try {
      const data = await fetchMyPublishedSchedule({
        storeId: selectedStoreId,
        from: weekStartIso,
        to: weekEndIso,
      });
      mergePublishedSchedule(groupPublishedScheduleByDate(data.items ?? []));
    } catch {
      // 班次信息失败不阻断打卡列表
    }
  }, [selectedStoreId, weekStartIso, weekEndIso, mergePublishedSchedule]);

  const loadPunches = useCallback(async () => {
    if (!selectedStoreId || !selected) {
      setPunches([]);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await fetchClockPunchesByDay({ storeId: selectedStoreId, date: selected });
      setPunches(data.punches ?? []);
      await refreshShiftPunchesForDate(selected);
    } catch (e) {
      setPunches([]);
      const message = e instanceof ApiError ? e.message : t('punchRecordsLoadFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selected, t, refreshShiftPunchesForDate]);

  useEffect(() => {
    if (!selectedStoreId) return;
    void loadWeekSchedule();
  }, [selectedStoreId, loadWeekSchedule]);

  useEffect(() => {
    if (!selectedStoreId) return;
    void loadPunches();
  }, [selectedStoreId, selected, loadPunches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadWeekSchedule(), loadPunches()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadWeekSchedule, loadPunches]);

  useRefreshOnAppForeground(onRefresh);

  const goToday = () => {
    const now = getApproximateServerNowDate();
    const iso = calendarDateKey(now);
    setWeekStart(startOfWeekMonday(now));
    setSelected(iso);
  };

  const prevWeek = () => {
    const n = addDays(weekStart, -7);
    setWeekStart(n);
    setSelected(calendarDateKey(n));
  };

  const nextWeek = () => {
    const n = addDays(weekStart, 7);
    setWeekStart(n);
    setSelected(calendarDateKey(n));
  };

  const renderPunchRow = (
    kind: 'in' | 'out',
    punch: AppClockPunchResult | null,
    emptyLabel: string,
  ) => {
    const isIn = kind === 'in';
    if (!punch) {
      return (
        <View style={styles.punchRow}>
          <View style={[styles.typePill, styles.typePillMuted]}>
            <Ionicons
              color={colors.textMuted}
              name={isIn ? 'log-in-outline' : 'log-out-outline'}
              size={16}
            />
            <Text style={styles.typePillTextMuted}>{isIn ? t('clockIn') : t('clockOut')}</Text>
          </View>
          <Text style={styles.missingText}>{emptyLabel}</Text>
        </View>
      );
    }

    const timeStr = formatPunchHm(punch.punchedAt, i18n.language);
    const taskLabel = formatPunchTaskTypeLabel(punch, t);

    return (
      <View style={[styles.punchRow, styles.punchRowDone]}>
        <View style={styles.punchRowLeft}>
          <View style={[styles.typePill, isIn ? styles.typePillInDone : styles.typePillOutDone]}>
            <Ionicons
              color={isIn ? colors.primaryDark : colors.success}
              name={isIn ? 'log-in-outline' : 'log-out-outline'}
              size={16}
            />
            <Text style={[styles.typePillText, isIn ? styles.typePillTextInDone : styles.typePillTextOutDone]}>
              {isIn ? t('clockIn') : t('clockOut')}
            </Text>
          </View>
          <View style={styles.taskPill}>
            <Text style={styles.taskPillText}>{taskLabel}</Text>
          </View>
        </View>
        <View style={styles.punchRowRight}>
          <Text style={[styles.timeText, !isIn && styles.timeTextOutDone]}>{timeStr}</Text>
        </View>
      </View>
    );
  };

  const renderShiftGroup = ({ item }: { item: ShiftPunchGroup }) => {
    const slot = item.slot;
    const anchorPunch = item.clockIn ?? item.clockOut ?? item.extra[0] ?? null;
    const isFieldGroup =
      isFieldJobPunchGroup(item.shiftKey) || (anchorPunch != null && isLikelyFieldJobPunch(anchorPunch));
    const fieldRange =
      anchorPunch?.shiftStartTime && anchorPunch?.shiftEndTime
        ? `${anchorPunch.shiftStartTime.slice(0, 5)}–${anchorPunch.shiftEndTime.slice(0, 5)}`
        : '';
    const unknownShiftId =
      item.scheduleId && item.scheduleId !== 'undefined' && item.scheduleId !== '0'
        ? item.scheduleId
        : '—';
    const title = isFieldGroup
      ? formatFieldJobPunchTitle(anchorPunch, t)
      : slot
        ? formatShiftHeroName(slot)
        : anchorPunch?.areaName?.trim() || anchorPunch?.shiftName?.trim()
          ? formatShiftHeroName({
              areaName: anchorPunch.areaName?.trim() || '—',
              shiftName: anchorPunch.shiftName?.trim() || '—',
            })
          : t('punchRecordsShiftUnknown', { id: unknownShiftId });
    const range = isFieldGroup ? fieldRange : slot?.range ?? fieldRange;

    return (
      <View style={[styles.shiftCard, isFieldGroup && styles.shiftCardField]}>
        <View style={styles.shiftHead}>
          <View style={styles.shiftTitleRow}>
            {isFieldGroup ? (
              <Ionicons color={colors.primary} name="car-outline" size={18} style={styles.shiftKindIcon} />
            ) : null}
            <Text style={styles.shiftTitle}>{title}</Text>
          </View>
          {range ? <Text style={styles.shiftRange}>{range}</Text> : null}
        </View>
        <View style={styles.punchBlock}>
          {renderPunchRow('in', item.clockIn, t('punchRecordsNoClockIn'))}
          <View style={styles.punchDivider} />
          {renderPunchRow('out', item.clockOut, t('punchRecordsNoClockOut'))}
        </View>
        {item.extra.length > 0 ? (
          <Text style={styles.extraNote}>
            {t('punchRecordsExtraPunches', { count: item.extra.length })}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('punchRecordsTitle'),
          headerShown: true,
          headerBackTitle: t('tabSchedule'),
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <View style={styles.toolbar}>
          {storeName ? (
            <Text style={styles.storeLine} numberOfLines={1}>
              {storeName}
            </Text>
          ) : null}
          <Text style={styles.dateLine}>
            {formatPunchHeaderDate(selected, language ?? i18n.language)}
          </Text>

          <View style={styles.weekBar}>
            <Pressable hitSlop={8} onPress={prevWeek} style={styles.weekChevron}>
              <Ionicons color={colors.primary} name="chevron-back" size={22} />
            </Pressable>
            <Pressable hitSlop={8} onPress={goToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>{t('scheduleGoToday')}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={nextWeek} style={styles.weekChevron}>
              <Ionicons color={colors.primary} name="chevron-forward" size={22} />
            </Pressable>
          </View>

          <View style={styles.dayRow}>
            {days.map((d) => {
              const active = d.iso === selected;
              const weekdayIdx = (d.date.getDay() + 6) % 7;
              return (
                <Pressable
                  key={d.iso}
                  onPress={() => setSelected(d.iso)}
                  style={[styles.dayCell, active && styles.dayCellActive]}
                >
                  <Text style={[styles.dayWeek, active && styles.dayWeekActive]} numberOfLines={1}>
                    {weekdayAbbr[weekdayIdx] ?? ''}
                  </Text>
                  <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.date.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {!selectedStoreId ? (
          <View style={styles.center}>
            <Text style={styles.empty}>{t('punchErrorNoStore')}</Text>
          </View>
        ) : loading && !hasAnyContent ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.empty}>{t('punchRecordsLoading')}</Text>
          </View>
        ) : error && !hasAnyContent ? (
          <View style={styles.center}>
            <Ionicons color={colors.textMuted} name="alert-circle-outline" size={48} />
            <Text style={styles.empty}>{error}</Text>
            <Pressable onPress={() => void loadPunches()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={shiftGroups}
            keyExtractor={(item) => item.shiftKey}
            ListEmptyComponent={<Text style={styles.emptyList}>{t('punchRecordsEmpty')}</Text>}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            renderItem={renderShiftGroup}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  storeLine: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  dateLine: { marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text },
  weekBar: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekChevron: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  todayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  todayBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dayRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  dayCellActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  dayWeek: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  dayWeekActive: { color: colors.primaryDark },
  dayNum: { marginTop: 2, fontSize: 15, fontWeight: '800', color: colors.text },
  dayNumActive: { color: colors.primaryDark },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  shiftCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shiftCardField: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FBFF',
  },
  shiftHead: { marginBottom: 10 },
  shiftTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftKindIcon: { marginTop: 1 },
  shiftTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  shiftRange: { marginTop: 4, fontSize: 18, fontWeight: '800', color: colors.primaryDark, fontVariant: ['tabular-nums'] },
  punchBlock: {
    borderRadius: 12,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  punchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  punchRowLeft: { flex: 1, gap: 8 },
  punchDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 12 },
  punchRowRight: { alignItems: 'flex-end', justifyContent: 'center' },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  taskPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  taskPillText: { fontSize: 11, fontWeight: '700', color: '#4338CA' },
  punchRowDone: { backgroundColor: '#FAFCFF' },
  typePillInDone: { backgroundColor: colors.primarySoft },
  typePillOutDone: { backgroundColor: '#D1FAE5' },
  typePillMuted: { backgroundColor: '#F0F2F6' },
  typePillText: { fontSize: 12, fontWeight: '800' },
  typePillTextInDone: { color: colors.primaryDark },
  typePillTextOutDone: { color: '#047857' },
  typePillTextMuted: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  timeText: { fontSize: 18, fontWeight: '800', color: colors.primaryDark, fontVariant: ['tabular-nums'] },
  timeTextOutDone: { color: '#047857' },
  missingText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  extraNote: { marginTop: 8, fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  emptyList: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 14 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: { color: '#fff', fontWeight: '800' },
});
