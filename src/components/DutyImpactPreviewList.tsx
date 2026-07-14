import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { AppAttendanceDutyImpact } from '../api/types';
import { colors } from '../theme/colors';
import { dutyImpactKey } from '../utils/leaveDutyImpact';

type Props = {
  impacts: AppAttendanceDutyImpact[];
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function triggerLabel(trigger: string | undefined, t: (k: string) => string): string {
  if (trigger === 'clock_in') return t('dutyTriggerClockIn');
  if (trigger === 'clock_out') return t('dutyTriggerClockOut');
  if (trigger === 'recurring') return t('dutyTriggerRecurring');
  return trigger ?? '';
}

function DutyImpactPreviewListComponent({ impacts }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.list}>
      {impacts.map((impact) => {
        const key = dutyImpactKey(impact);
        const required = impact.requiredAction === 'required';
        const title = (impact.title ?? '').trim() || t('dutyImpactUntitled');
        return (
          <View key={key} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.titleWrap}>
                <Ionicons color={colors.primaryDark} name="clipboard-outline" size={16} />
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              <View style={[styles.badge, required ? styles.badgeRequired : styles.badgeOptional]}>
                <Text
                  style={[
                    styles.badgeText,
                    required ? styles.badgeTextRequired : styles.badgeTextOptional,
                  ]}
                >
                  {required ? t('leaveDutyImpactRequired') : t('leaveDutyImpactOptional')}
                </Text>
              </View>
            </View>
            {impact.workDate ? (
              <MetaRow label={t('leaveDutyImpactDate')} value={impact.workDate} />
            ) : null}
            {impact.triggerType ? (
              <MetaRow
                label={t('leaveDutyImpactTrigger')}
                value={triggerLabel(impact.triggerType, t)}
              />
            ) : null}
            {impact.overlapType === 'full' || impact.overlapType === 'partial' ? (
              <MetaRow
                label={t('leaveDutyImpactOverlap')}
                value={
                  impact.overlapType === 'full'
                    ? t('leaveDutyOverlapFull')
                    : t('leaveDutyOverlapPartial')
                }
              />
            ) : null}
            {impact.description ? <Text style={styles.desc}>{impact.description}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export const DutyImpactPreviewList = memo(DutyImpactPreviewListComponent);

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 8 },
  card: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 6,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeRequired: { backgroundColor: '#FEE2E2' },
  badgeOptional: { backgroundColor: '#E2E8F0' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextRequired: { color: '#B91C1C' },
  badgeTextOptional: { color: '#475569' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaLabel: { fontSize: 12, color: '#64748b' },
  metaValue: { fontSize: 12, color: '#0f172a', flexShrink: 1, textAlign: 'right' },
  desc: { fontSize: 12, color: '#64748b', marginTop: 2 },
});
