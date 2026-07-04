import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeaveRequest } from '../context/AuthContext';
import type { TimelineFieldJobItem } from '../types/fieldService';
import { colors } from '../theme/colors';
import { formatPunchHm } from '../utils/formatPunchTime';
import {
  canApplyFieldMissedPunchIn,
  canApplyFieldMissedPunchOut,
  preferredFieldMissedPunchKind,
  getFieldJobDisplayState,
  type FieldJobDisplayState,
} from '../utils/fieldMissedPunchEligibility';
import { openFieldLeaveRequest, openFieldMissedPunchRequest } from '../utils/openFieldRequest';
import { canApplyFieldLeave } from '../utils/fieldLeaveEligibility';
import { formatFieldServiceType, formatFieldSyncConfig } from '../utils/fieldServiceType';
import { canOpenMapsNavigation, openMapsNavigation } from '../utils/openMapsNavigation';
import { canOpenPhoneDial, openPhoneDial } from '../utils/openPhoneDial';
import { getApproximateServerNowDate } from '../utils/serverClock';

type Props = {
  job: TimelineFieldJobItem;
  nested?: boolean;
  workDateIso?: string;
  attendanceRequests?: LeaveRequest[];
};

function formatJobTime(value: string, language: string): string {
  if (!value) return '--:--';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatPunchHm(value, language);
  return value;
}

function badgeForState(state: FieldJobDisplayState) {
  switch (state) {
    case 'completed':
      return { bg: '#D1FAE5', text: '#047857', icon: 'checkmark-done-outline' as const, key: 'fieldJobBadgeCompleted' };
    case 'in_progress':
      return { bg: '#FEF3C7', text: '#B45309', icon: 'time-outline' as const, key: 'fieldJobBadgeInProgress' };
    case 'incomplete':
      return { bg: '#FEE2E2', text: '#B91C1C', icon: 'alert-circle-outline' as const, key: 'fieldJobBadgeIncomplete' };
    case 'missed_punch_pending':
      return { bg: '#FEF3C7', text: '#B45309', icon: 'document-text-outline' as const, key: 'fieldJobBadgeMissedPending' };
    case 'missed_punch_partial':
      return { bg: '#FEF3C7', text: '#B45309', icon: 'alert-circle-outline' as const, key: 'fieldJobBadgeMissedPartial' };
    case 'missed_punch_approved':
      return { bg: '#D1FAE5', text: '#047857', icon: 'checkmark-circle-outline' as const, key: 'fieldJobBadgeMissedApproved' };
    case 'not_started':
    default:
      return { bg: '#F1F5F9', text: colors.textMuted, icon: 'ellipse-outline' as const, key: 'fieldJobBadgeNotStarted' };
  }
}

type ContactActionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  value: string;
  onPress?: () => void | Promise<void>;
  accessibilityLabel: string;
};

function ContactActionRow({
  icon,
  iconBg,
  iconColor,
  value,
  onPress,
  accessibilityLabel,
}: ContactActionProps) {
  const content = (
    <>
      <View style={[styles.actionIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons color={iconColor} name={icon} size={18} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionValue}>{value}</Text>
      </View>
      {onPress ? <Ionicons color={colors.textMuted} name="chevron-forward" size={18} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.contactAction}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.contactAction, pressed && styles.contactActionPressed]}
    >
      {content}
    </Pressable>
  );
}

export function FieldJobRow({ job, nested = false, workDateIso, attendanceRequests = [] }: Props) {
  const { t, i18n } = useTranslation();
  const [detailVisible, setDetailVisible] = useState(false);
  const now = getApproximateServerNowDate();
  const displayState = getFieldJobDisplayState(job, attendanceRequests, now);
  const badge = badgeForState(displayState);
  const customerName = job.customerName?.trim() ?? '';
  const rawAddress = job.serviceAddress?.trim() ?? '';
  const address = rawAddress || t('todayTimelineNoAddress');
  const rawPhone = job.customerPhone?.trim() ?? '';
  const canCall = canOpenPhoneDial(rawPhone);
  const canNavigate = canOpenMapsNavigation({
    latitude: job.latitude,
    longitude: job.longitude,
    address: rawAddress,
  });
  const startHm = formatJobTime(job.start, i18n.language);
  const endHm = formatJobTime(job.end, i18n.language);
  const range = `${startHm}\u00A0-\u00A0${endHm}`;

  const canApplyIn = canApplyFieldMissedPunchIn(job, attendanceRequests, now);
  const canApplyOut = canApplyFieldMissedPunchOut(job, attendanceRequests, now);
  const showMissedApply = canApplyIn || canApplyOut;
  const showLeaveApply = canApplyFieldLeave(job, attendanceRequests);

  const onAddressPress = async () => {
    const ok = await openMapsNavigation({
      latitude: job.latitude,
      longitude: job.longitude,
      address: rawAddress,
    });
    if (!ok) {
      Alert.alert(t('tabSchedule'), t('fieldJobAddressNavigateFailed'));
    }
  };

  const onPhonePress = async () => {
    const ok = await openPhoneDial(rawPhone);
    if (!ok) {
      Alert.alert(t('tabSchedule'), t('fieldJobPhoneCallFailed'));
    }
  };

  const onMissedApply = () => {
    const punchKind = preferredFieldMissedPunchKind(job, attendanceRequests, now);
    if (!punchKind) return;
    openFieldMissedPunchRequest({ job, punchKind, workDate: workDateIso });
  };

  const onLeaveApply = () => {
    openFieldLeaveRequest({ job, workDate: workDateIso });
  };

  const syncHint =
    (canApplyIn && job.syncStoreClockIn) || (canApplyOut && job.syncStoreClockOut)
      ? t('fieldJobMissedPunchSyncHint')
      : null;

  const serviceType = formatFieldServiceType(job.serviceType, t);
  const notes = job.notes?.trim() ?? '';
  const syncConfig = formatFieldSyncConfig(job, t);
  const detailEmpty = t('fieldJobDetailEmpty');

  return (
    <View style={[styles.card, nested && styles.cardNested]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('fieldJobDetailOpen')}
        onPress={() => setDetailVisible(true)}
        style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressablePressed]}
      >
        <View style={styles.headerRow}>
          <View style={styles.iconBox}>
            <Ionicons color="#FFFFFF" name="car-outline" size={18} />
          </View>
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <Text style={styles.kind} numberOfLines={1}>
                {t('todayTimelineFieldJob')}
              </Text>
              <View style={[styles.pill, { backgroundColor: badge.bg }]}>
                <Ionicons color={badge.text} name={badge.icon} size={11} />
                <Text style={[styles.pillText, { color: badge.text }]}>{t(badge.key)}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.range}>{range}</Text>
              {customerName ? (
                <>
                  <Text style={styles.metaSep}>{' \u00b7 '}</Text>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {customerName}
                  </Text>
                </>
              ) : null}
            </View>
            {displayState === 'incomplete' ? (
              <Text style={styles.hintText}>{t('fieldJobIncompleteHint')}</Text>
            ) : null}
            {displayState === 'missed_punch_pending' ? (
              <Text style={styles.hintText}>{t('fieldJobMissedPendingHint')}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.contactBlock}>
        {canNavigate ? (
          <ContactActionRow
            accessibilityLabel={t('fieldJobAddressNavigate')}
            icon="navigate-outline"
            iconBg={colors.field}
            iconColor="#FFFFFF"
            value={address}
            onPress={onAddressPress}
          />
        ) : (
          <ContactActionRow
            accessibilityLabel={address}
            icon="location-outline"
            iconBg={colors.fieldSoft}
            iconColor={colors.fieldInk}
            value={address}
          />
        )}
        {canCall ? (
          <ContactActionRow
            accessibilityLabel={t('fieldJobPhoneCall')}
            icon="call-outline"
            iconBg={colors.field}
            iconColor="#FFFFFF"
            value={rawPhone}
            onPress={onPhonePress}
          />
        ) : null}
      </View>
      {showMissedApply ? (
        <View style={styles.applyBlock}>
          {syncHint ? <Text style={styles.syncHint}>{syncHint}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={onMissedApply}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}
          >
            <Ionicons color={colors.fieldInk} name="create-outline" size={16} />
            <Text style={styles.applyBtnText}>{t('fieldJobMissedPunchApply')}</Text>
          </Pressable>
        </View>
      ) : null}

      {showLeaveApply ? (
        <View style={styles.applyBlock}>
          <Pressable
            accessibilityRole="button"
            onPress={onLeaveApply}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}
          >
            <Ionicons color={colors.fieldInk} name="calendar-outline" size={16} />
            <Text style={styles.applyBtnText}>{t('fieldJobLeaveApply')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={detailVisible}
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDetailVisible(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('fieldJobDetailTitle')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                hitSlop={8}
                onPress={() => setDetailVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons color={colors.textMuted} name="close" size={22} />
              </Pressable>
            </View>
            {customerName ? (
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {customerName}
                {' · '}
                {range}
              </Text>
            ) : (
              <Text style={styles.modalSubtitle}>{range}</Text>
            )}
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{t('fieldJobServiceType')}</Text>
              <Text style={styles.modalValue}>{serviceType || detailEmpty}</Text>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{t('fieldJobSyncStore')}</Text>
              <Text style={styles.modalValueMultiline}>{syncConfig}</Text>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{t('fieldJobNotes')}</Text>
              <Text style={styles.modalValueMultiline}>{notes || detailEmpty}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ICON_COLUMN = 40;
const HEADER_GAP = 12;

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardNested: {
    marginLeft: 20,
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  headerPressable: {
    marginHorizontal: -4,
    marginTop: -4,
    paddingHorizontal: 4,
    paddingTop: 4,
    borderRadius: 10,
  },
  headerPressablePressed: { backgroundColor: 'rgba(15, 23, 42, 0.04)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: HEADER_GAP,
  },
  iconBox: {
    width: ICON_COLUMN,
    height: ICON_COLUMN,
    borderRadius: 12,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  main: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kind: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'nowrap',
    minWidth: 0,
  },
  range: { flexShrink: 0, fontSize: 15, fontWeight: '800', color: colors.text },
  metaSep: { flexShrink: 0, fontSize: 15, fontWeight: '700', color: colors.textMuted },
  customerName: { flex: 1, flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  hintText: { fontSize: 12, fontWeight: '600', color: '#B91C1C', lineHeight: 17 },
  contactBlock: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_GAP,
    minHeight: 52,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  contactActionPressed: { backgroundColor: '#F1F5F9' },
  actionIconWrap: {
    width: ICON_COLUMN,
    height: ICON_COLUMN,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  actionValue: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  pill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  applyBlock: { gap: 6, paddingTop: 2 },
  syncHint: { fontSize: 12, fontWeight: '600', color: colors.textMuted, lineHeight: 17 },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.field,
    backgroundColor: colors.fieldSoft,
  },
  applyBtnPressed: { opacity: 0.88 },
  applyBtnText: { fontSize: 14, fontWeight: '700', color: colors.fieldInk },
  modalWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, lineHeight: 18 },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  modalValue: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 22 },
  modalValueMultiline: { fontSize: 15, fontWeight: '500', color: colors.text, lineHeight: 22 },
});
