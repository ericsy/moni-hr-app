import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { TimelineFieldJobItem } from '../types/fieldService';
import { colors } from '../theme/colors';
import { formatPunchHm } from '../utils/formatPunchTime';

type Props = {
  job: TimelineFieldJobItem;
  nested?: boolean;
};

function formatJobTime(value: string, language: string): string {
  if (!value) return '--:--';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatPunchHm(value, language);
  return value;
}

function jobBadge(job: TimelineFieldJobItem) {
  if (job.fieldClockOutAt) {
    return { bg: '#D1FAE5', text: '#047857', icon: 'checkmark-done-outline' as const, key: 'fieldJobBadgeCompleted' };
  }
  if (job.fieldClockInAt) {
    return { bg: '#FEF3C7', text: '#B45309', icon: 'time-outline' as const, key: 'fieldJobBadgeInProgress' };
  }
  return { bg: '#F1F5F9', text: colors.textMuted, icon: 'ellipse-outline' as const, key: 'fieldJobBadgeNotStarted' };
}

export function FieldJobRow({ job, nested = false }: Props) {
  const { t, i18n } = useTranslation();
  const badge = jobBadge(job);
  const title = job.customerName?.trim() || t('todayTimelineFieldJob');
  const address = job.serviceAddress?.trim() || t('todayTimelineNoAddress');
  const range = `${formatJobTime(job.start, i18n.language)} - ${formatJobTime(job.end, i18n.language)}`;

  return (
    <View style={[styles.row, nested && styles.rowNested]}>
      <View style={styles.iconBox}>
        <Ionicons color="#FFFFFF" name="car-outline" size={18} />
      </View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.kind}>{t('todayTimelineFieldJob')}</Text>
        </View>
        <Text style={styles.range}>{range}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: badge.bg }]}>
        <Ionicons color={badge.text} name={badge.icon} size={11} />
        <Text style={[styles.pillText, { color: badge.text }]}>{t(badge.key)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowNested: {
    marginLeft: 20,
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { fontSize: 11, fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase' },
  range: { fontSize: 15, fontWeight: '800', color: colors.text },
  title: { fontSize: 13, fontWeight: '700', color: colors.text },
  address: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 4,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
});
