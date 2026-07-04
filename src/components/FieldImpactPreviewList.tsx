import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { AppAttendanceFieldImpact } from '../api/types';
import { colors } from '../theme/colors';
import { buildFieldImpactDisplay } from '../utils/formatFieldImpact';

type Props = {
  impacts: AppAttendanceFieldImpact[];
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function FieldImpactPreviewList({ impacts }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  return (
    <View style={styles.list}>
      {impacts.map((impact) => {
        const row = buildFieldImpactDisplay(impact, t, language);
        const key = `${impact.fieldJobId}-${impact.leaveItemId ?? 'x'}`;
        return (
          <View key={key} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.titleWrap}>
                <Ionicons color={colors.primaryDark} name="car-outline" size={16} />
                <Text style={styles.title} numberOfLines={1}>
                  {row.title}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  row.required ? styles.badgeRequired : styles.badgeOptional,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    row.required ? styles.badgeTextRequired : styles.badgeTextOptional,
                  ]}
                >
                  {row.required ? t('leaveFieldImpactRequired') : t('leaveFieldImpactOptional')}
                </Text>
              </View>
            </View>
            <MetaRow label={t('leaveFieldImpactDate')} value={row.dateLabel} />
            <MetaRow label={t('leaveFieldImpactTime')} value={row.rangeLabel} />
            {row.serviceTypeLabel ? (
              <MetaRow label={t('fieldJobServiceType')} value={row.serviceTypeLabel} />
            ) : null}
            {row.overlapLabel ? (
              <MetaRow label={t('leaveFieldImpactOverlap')} value={row.overlapLabel} />
            ) : null}
            {row.syncLabel ? <Text style={styles.syncHint}>{row.syncLabel}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 8 },
  card: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardHead: {
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
    fontSize: 14,
    fontWeight: '800',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRequired: { backgroundColor: '#FEF3C7' },
  badgeOptional: { backgroundColor: '#F1F5F9' },
  badgeText: { flexShrink: 0, fontSize: 11, fontWeight: '700' },
  badgeTextRequired: { color: '#B45309' },
  badgeTextOptional: { color: colors.textMuted },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    width: 72,
  },
  metaValue: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  syncHint: {
    color: colors.primaryDark,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
