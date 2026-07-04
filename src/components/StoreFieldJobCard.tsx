import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { StoreDayFieldJob } from '../api/mapStoreFieldJobs';
import { colors } from '../theme/colors';
import { formatFieldServiceType, formatFieldSyncConfig } from '../utils/fieldServiceType';

type Props = {
  job: StoreDayFieldJob;
  nested?: boolean;
};

export function StoreFieldJobCard({ job, nested = false }: Props) {
  const { t } = useTranslation();
  const syncLabel = formatFieldSyncConfig(job, t);
  const serviceTypeLabel = formatFieldServiceType(job.serviceType, t);

  return (
    <View style={[styles.card, nested && styles.cardNested]}>
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Ionicons color={colors.primaryDark} name="car-outline" size={18} />
          <Text style={styles.title} numberOfLines={1}>
            {job.customerName}
          </Text>
        </View>
        <Text style={styles.time}>{job.range}</Text>
      </View>
      {serviceTypeLabel ? (
        <Text style={styles.meta} numberOfLines={1}>
          {t('fieldJobServiceType')}: {serviceTypeLabel}
        </Text>
      ) : null}
      {job.serviceAddress ? (
        <Text style={styles.meta} numberOfLines={2}>
          {t('fieldJobAddressLabel')}: {job.serviceAddress}
        </Text>
      ) : null}
      {syncLabel ? (
        <Text style={styles.sync} numberOfLines={2}>
          {syncLabel}
        </Text>
      ) : null}
      <View style={styles.assigneeWrap}>
        {job.assignees.length === 0 ? (
          <Text style={styles.assigneeEmpty}>{t('storeChipNoAssignments')}</Text>
        ) : (
          job.assignees.map((entry) => (
            <View key={entry.id} style={styles.assigneePill}>
              <Text style={styles.assigneeText} numberOfLines={1}>
                {entry.name}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardNested: {
    marginLeft: 8,
    backgroundColor: '#FFFFFF',
  },
  head: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  titleWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  time: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  sync: {
    color: colors.primaryDark,
    fontSize: 12,
    lineHeight: 17,
  },
  assigneeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  assigneePill: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assigneeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  assigneeEmpty: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
