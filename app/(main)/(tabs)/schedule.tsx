import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_MY_SHIFTS, type RegionKey, type ShiftKey } from '../../../src/data/demoMyShifts';
import { getActiveStore, useAuth } from '../../../src/context/AuthContext';
import { colors } from '../../../src/theme/colors';
import { calendarDateKey } from '../../../src/utils/calendarDateKey';

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

function formatSelectedHeaderLine(d: Date, lang: string): string {
  const loc = lang.startsWith('zh') ? 'zh-CN' : 'en-NZ';
  try {
    return new Intl.DateTimeFormat(loc, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

function weekNavigatorLabels(weekStart: Date, lang: string): { rangeLine: string; metaLine: string } {
  const end = addDays(weekStart, 6);
  const loc = lang.startsWith('zh') ? 'zh-CN' : 'en-NZ';
  const d0 = weekStart.getDate();
  const d1 = end.getDate();
  const rangeLine = `${d0} – ${d1}`;
  let metaLine: string;
  if (weekStart.getMonth() === end.getMonth() && weekStart.getFullYear() === end.getFullYear()) {
    metaLine = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(weekStart);
  } else {
    metaLine = `${new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' }).format(weekStart)} – ${new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', year: 'numeric' }).format(end)}`;
  }
  return { rangeLine, metaLine };
}

const MY_SHIFTS = DEMO_MY_SHIFTS as Record<string, ScheduleSlot[]>;

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

function dayHasWork(iso: string, mode: 'my' | 'store', storeId: string): boolean {
  if (mode === 'my') {
    return (MY_SHIFTS[iso]?.length ?? 0) > 0;
  }
  const roster = getStoreDayRoster(iso, storeId);
  return roster.some((rg) => rg.shifts.length > 0);
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session, setSelectedStore } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [selected, setSelected] = useState(() => calendarDateKey(new Date()));
  const [mode, setMode] = useState<'my' | 'store'>('my');
  const [storePickerVisible, setStorePickerVisible] = useState(false);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { iso: calendarDateKey(d), date: d };
    });
  }, [weekStart]);

  const weekdayAbbr = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  const canSeeStore = session?.user.role === 'manager';

  const selectedStoreId = session?.user?.selectedStoreId ?? '';

  const myShifts = MY_SHIFTS[selected] ?? [];
  const storeDayRoster = useMemo(
    () => getStoreDayRoster(selected, selectedStoreId),
    [selected, selectedStoreId],
  );
  const todayIso = calendarDateKey(new Date());
  const isToday = selected === todayIso;

  const selectedDateObj = useMemo(() => parseIsoToLocalDate(selected), [selected]);
  const selectedHeaderLine = useMemo(
    () => formatSelectedHeaderLine(selectedDateObj, i18n.language),
    [selectedDateObj, i18n.language],
  );
  const weekNavLabels = useMemo(() => weekNavigatorLabels(weekStart, i18n.language), [weekStart, i18n.language]);

  const goToday = () => {
    const now = new Date();
    setWeekStart(startOfWeekMonday(now));
    setSelected(calendarDateKey(now));
  };

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

  /** 切换选中日后，若「我的排班」当日条目带 storeId，则自动对齐当前门店（与手动切换共用 selectedStoreId） */
  useEffect(() => {
    if (!session?.user) return;
    const slots = MY_SHIFTS[selected];
    const fromSchedule = slots?.find((s) => s.storeId)?.storeId;
    if (
      fromSchedule &&
      session.user.stores.some((s) => s.id === fromSchedule) &&
      fromSchedule !== session.user.selectedStoreId
    ) {
      setSelectedStore(fromSchedule);
    }
  }, [selected, session?.user, setSelectedStore]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pageHeader}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>{t('tabSchedule')}</Text>
          <Text style={styles.selectedDateLine}>{selectedHeaderLine}</Text>
          {session?.user ? (
            session.user.stores.length > 1 ? (
              <Pressable
                hitSlop={8}
                onPress={() => setStorePickerVisible(true)}
                style={styles.storePickerBtn}
              >
                <Text style={styles.sub} numberOfLines={1}>
                  {getActiveStore(session.user)?.name ?? ''}
                </Text>
                <Ionicons color={colors.primary} name="chevron-down" size={18} />
              </Pressable>
            ) : (
              <Text style={styles.sub} numberOfLines={1}>
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
            <Pressable onPress={goToday} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>{t('scheduleGoToday')}</Text>
            </Pressable>
            <Pressable onPress={() => setMode((m) => (m === 'my' ? 'store' : 'my'))} style={styles.btnOutline}>
              <Text style={styles.btnOutlineText}>
                {mode === 'my' ? t('scheduleViewStore') : t('scheduleViewMy')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <View style={styles.dayRow}>
          {days.map((d) => {
            const active = d.iso === selected;
            const weekdayIdx = (d.date.getDay() + 6) % 7;
            const hasWork = dayHasWork(d.iso, mode, selectedStoreId);
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
        ) : myShifts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={48} />
            <Text style={styles.empty}>{t('noShifts')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {myShifts.map((s, idx) => (
              <View key={`${selected}-${idx}`} style={styles.card}>
                {isToday ? (
                  <View style={styles.cardTop}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{t('today')}</Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.cardTimeHero}>{s.range}</Text>
                <Text style={styles.cardMetaLbl}>{t('scheduleRegion')}</Text>
                <Text style={styles.cardMetaVal}>{t(s.region)}</Text>
                <Text style={[styles.cardMetaLbl, styles.cardMetaLblAfter]}>{t('scheduleShift')}</Text>
                <Text style={styles.cardMetaVal}>{t(s.shiftKey)}</Text>
              </View>
            ))}
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
                    setSelectedStore(s.id);
                    setStorePickerVisible(false);
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
  pageHeader: { flexShrink: 0 },
  pageScroll: { flex: 1 },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  selectedDateLine: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sub: { marginTop: 6, color: colors.textMuted, fontSize: 13 },
  storePickerBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '88%',
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
  panel: { paddingHorizontal: 20, paddingTop: 8 },
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
});
