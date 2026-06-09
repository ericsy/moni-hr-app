import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { calendarDateKey } from '../utils/calendarDateKey';
import { addDaysLocal, compareDateKeys, parseDateKey } from '../utils/localDateTime';

type Props = {
  visible: boolean;
  title: string;
  /** 打开时定位到的月份（yyyy-MM-dd 任一天） */
  anchorIso: string;
  minIso?: string;
  /** 可选上限；选「区间开始日」时不要传为当前结束日，否则无法把开始选到结束日之后（应先选开始再自动顺延结束）。 */
  maxIso?: string;
  onRequestClose: () => void;
  /** 用户点选某日 */
  onSelectDate: (iso: string) => void;
};

function monthMatrix(year: number, monthIndex: number): { iso: string; inMonth: boolean }[][] {
  const first = new Date(year, monthIndex, 1);
  const pad = (first.getDay() + 6) % 7;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < pad; i++) {
    const d = addDaysLocal(first, i - pad);
    cells.push({ iso: calendarDateKey(d), inMonth: false });
  }
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    cells.push({ iso: calendarDateKey(d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = parseDateKey(cells[cells.length - 1].iso);
    cells.push({ iso: calendarDateKey(addDaysLocal(last, 1)), inMonth: false });
  }
  const rows: { iso: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export function CalendarDatePickerModal({
  visible,
  title,
  anchorIso,
  minIso,
  maxIso,
  onRequestClose,
  onSelectDate,
}: Props) {
  const { t } = useTranslation();
  const anchor = useMemo(() => parseDateKey(anchorIso || calendarDateKey(new Date())), [anchorIso]);
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekdayLabels = useMemo(() => t('weekdayAbbrList').split(',').map((s) => s.trim()), [t]);

  useEffect(() => {
    if (!visible) return;
    const a = parseDateKey(anchorIso || calendarDateKey(new Date()));
    setViewYear(a.getFullYear());
    setViewMonth(a.getMonth());
  }, [visible, anchorIso]);

  const monthTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    const lng = t('weekdayAbbrList').includes('周') ? 'zh' : 'en';
    if (lng === 'zh') {
      return `${viewYear}年${viewMonth + 1}月`;
    }
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth, t]);

  if (!visible) return null;

  const disabled = (iso: string) => {
    if (minIso && compareDateKeys(iso, minIso) < 0) return true;
    if (maxIso && compareDateKeys(iso, maxIso) > 0) return true;
    return false;
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.monthNav}>
            <Pressable hitSlop={8} onPress={() => shiftMonth(-1)} style={styles.monthNavBtn}>
              <Ionicons color={colors.primary} name="chevron-back" size={22} />
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle}</Text>
            <Pressable hitSlop={8} onPress={() => shiftMonth(1)} style={styles.monthNavBtn}>
              <Ionicons color={colors.primary} name="chevron-forward" size={22} />
            </Pressable>
          </View>
          <View style={styles.weekHead}>
            {weekdayLabels.map((label, i) => (
              <Text key={i} style={styles.weekHeadCell}>
                {label}
              </Text>
            ))}
          </View>
          {matrix.map((row, ri) => (
            <View key={ri} style={styles.weekRow}>
              {row.map((cell) => {
                const dim = !cell.inMonth || disabled(cell.iso);
                return (
                  <Pressable
                    key={`${ri}-${cell.iso}`}
                    disabled={dim}
                    onPress={() => {
                      if (dim) return;
                      onSelectDate(cell.iso);
                      onRequestClose();
                    }}
                    style={[styles.dayCell, dim && styles.dayCellDim]}
                  >
                    <Text style={[styles.dayText, dim && styles.dayTextDim]}>
                      {parseDateKey(cell.iso).getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Pressable onPress={onRequestClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 12 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthNavBtn: { padding: 8 },
  monthTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  weekHeadCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    paddingVertical: 4,
  },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellDim: { opacity: 0.35 },
  dayText: { fontSize: 15, fontWeight: '700', color: colors.text },
  dayTextDim: { color: colors.textMuted },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: { fontWeight: '800', color: colors.textMuted },
});
