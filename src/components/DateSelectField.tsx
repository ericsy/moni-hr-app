import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { calendarDateKey } from '../utils/calendarDateKey';
import { formatPunchHeaderDate } from '../utils/formatPunchTime';
import {
  addDaysLocal,
  parseDateKey,
  startOfWeekMondayLocal,
} from '../utils/localDateTime';
import { getApproximateServerNowDate } from '../utils/serverClock';

type Props = {
  value: string;
  onChange: (dateKey: string) => void;
};

export function DateSelectField({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMondayLocal(parseDateKey(value)));
  const [draft, setDraft] = useState(value);

  const weekdayAbbr = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDaysLocal(weekStart, i);
      return { iso: calendarDateKey(d), date: d };
    });
  }, [weekStart]);

  const open = () => {
    setDraft(value);
    setWeekStart(startOfWeekMondayLocal(parseDateKey(value)));
    setVisible(true);
  };

  const confirm = () => {
    onChange(draft);
    setVisible(false);
  };

  const goToday = () => {
    const now = getApproximateServerNowDate();
    const iso = calendarDateKey(now);
    setWeekStart(startOfWeekMondayLocal(now));
    setDraft(iso);
  };

  return (
    <>
      <Pressable onPress={open} style={styles.trigger}>
        <Text style={styles.triggerText}>{formatPunchHeaderDate(value, i18n.language)}</Text>
        <Ionicons color={colors.primary} name="calendar-outline" size={20} />
      </Pressable>

      <Modal animationType="fade" transparent visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('pickDate')}</Text>

            <View style={styles.weekBar}>
              <Pressable
                hitSlop={8}
                onPress={() => setWeekStart((ws) => addDaysLocal(ws, -7))}
                style={styles.weekBtn}
              >
                <Ionicons color={colors.primary} name="chevron-back" size={22} />
              </Pressable>
              <Pressable onPress={goToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>{t('scheduleGoToday')}</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => setWeekStart((ws) => addDaysLocal(ws, 7))}
                style={styles.weekBtn}
              >
                <Ionicons color={colors.primary} name="chevron-forward" size={22} />
              </Pressable>
            </View>

            <View style={styles.dayRow}>
              {days.map((d) => {
                const active = d.iso === draft;
                const weekdayIdx = (d.date.getDay() + 6) % 7;
                return (
                  <Pressable
                    key={d.iso}
                    onPress={() => setDraft(d.iso)}
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

            <Text style={styles.preview}>{formatPunchHeaderDate(draft, i18n.language)}</Text>

            <View style={styles.actions}>
              <Pressable onPress={() => setVisible(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable onPress={confirm} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>{t('requestPickerDone')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FAFBFD',
  },
  triggerText: { fontSize: 15, fontWeight: '600', color: colors.text },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 12 },
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  todayBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dayRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
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
  preview: { marginTop: 12, fontSize: 14, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  actions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '800', color: colors.text },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  primaryText: { fontWeight: '800', color: '#fff' },
});
