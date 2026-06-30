import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type {
  TimelineFieldJobItem,
  TimelineStoreShiftItem,
  TodayWorkTimelineItem,
} from '../../types/fieldService';
import { colors } from '../../theme/colors';
import { formatPunchHm } from '../../utils/formatPunchTime';

type TimelineGroup = {
  storeShift: TimelineStoreShiftItem | null;
  fieldJobs: TimelineFieldJobItem[];
};

function formatTimelineTime(value: string, language: string): string {
  if (!value) return '--:--';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatPunchHm(value, language);
  return value;
}

function groupTimelineItems(items: TodayWorkTimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const item of items) {
    if (item.type === 'store_shift') {
      groups.push({ storeShift: item, fieldJobs: [] });
      continue;
    }
    const lastGroup = groups[groups.length - 1];
    if (lastGroup) {
      lastGroup.fieldJobs.push(item);
    } else {
      groups.push({ storeShift: null, fieldJobs: [item] });
    }
  }
  return groups;
}

type Props = {
  timeline: TodayWorkTimelineItem[];
};

export function TodayWorkTimeline({ timeline }: Props) {
  const { t, i18n } = useTranslation();
  const groups = groupTimelineItems(timeline);

  if (groups.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons color={colors.textMuted} name="list-outline" size={22} />
        <Text style={styles.emptyText}>{t('todayTimelineEmpty')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((group, groupIndex) => {
        const store = group.storeShift;
        return (
          <View key={`timeline-group-${groupIndex}-${store?.id ?? 'field-only'}`} style={styles.groupCard}>
            {store ? (
              <View style={styles.storeHead}>
                <View style={styles.storeTitleRow}>
                  <Ionicons color={colors.store} name="business-outline" size={16} />
                  <Text style={styles.storeName} numberOfLines={1}>
                    {store.storeName || t('todayTimelineStoreShift')}
                  </Text>
                </View>
                <Text style={styles.storeTime}>
                  {formatTimelineTime(store.start, i18n.language)} -{' '}
                  {formatTimelineTime(store.end, i18n.language)}
                </Text>
              </View>
            ) : null}

            {group.fieldJobs.length > 0 ? (
              <View style={[styles.jobsWrap, !store && styles.jobsWrapStandalone]}>
                {group.fieldJobs.map((job, idx) => {
                  const done = !!job.fieldClockOutAt;
                  const started = !!job.fieldClockInAt;
                  return (
                    <View key={job.id || `${groupIndex}-${idx}`} style={styles.jobRow}>
                      <View style={styles.jobRail}>
                        <View style={[styles.jobDot, done ? styles.jobDotDone : started ? styles.jobDotStarted : null]} />
                        {idx < group.fieldJobs.length - 1 ? <View style={styles.jobLine} /> : null}
                      </View>
                      <View style={styles.jobBody}>
                        <View style={styles.jobTopRow}>
                          <Text style={styles.jobTitle} numberOfLines={1}>
                            {job.customerName || t('todayTimelineFieldJob')}
                          </Text>
                          <Text style={styles.jobTime}>
                            {formatTimelineTime(job.start, i18n.language)}-{formatTimelineTime(job.end, i18n.language)}
                          </Text>
                        </View>
                        <Text style={styles.jobAddress} numberOfLines={2}>
                          {job.serviceAddress || t('todayTimelineNoAddress')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noFieldJobs}>{t('todayTimelineNoFieldJobs')}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  groupCard: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  storeHead: {
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  storeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  storeTime: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  jobsWrap: { gap: 10 },
  jobsWrapStandalone: { marginTop: 2 },
  noFieldJobs: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  jobRow: { flexDirection: 'row', gap: 10 },
  jobRail: { width: 14, alignItems: 'center' },
  jobDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#BFDBFE',
    marginTop: 4,
  },
  jobDotStarted: { backgroundColor: colors.warning },
  jobDotDone: { backgroundColor: colors.success },
  jobLine: { width: 2, flex: 1, marginTop: 4, backgroundColor: colors.border },
  jobBody: { flex: 1, gap: 4 },
  jobTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  jobTime: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  jobAddress: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  emptyWrap: {
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
