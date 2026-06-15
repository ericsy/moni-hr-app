import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import { colors } from '../theme/colors';
import type { ShiftLeaveRequestStatus } from '../utils/leaveRequestEligibility';
import { getTodayShiftBadgeKind, type TodayShiftBadgeKind } from '../utils/scheduleHeroShift';
import { getApproximateServerNowDate } from '../utils/serverClock';
import { getShiftCardActions } from '../utils/shiftClockWindow';

const ROW_ICON_COLORS = [colors.primary, colors.success, '#8B5CF6', '#F59E0B'];

type Props = {
  slot: MyPublishedShiftSlot;
  index: number;
  workDateIso: string;
  todayIso: string;
  punch?: ShiftPunchRecord;
  pairPunch?: ShiftPunchRecord;
  punchesKnown?: boolean;
  leaveRequestStatus?: ShiftLeaveRequestStatus;
  missedPunchApplyBlocked?: boolean;
  leaveApplyBlocked?: boolean;
  onApplyMissed: () => void;
  onApplyLeave: () => void;
};

function badgeStyle(kind: TodayShiftBadgeKind) {
  switch (kind) {
    case 'not_punched':
      return { bg: '#D1FAE5', text: '#047857', icon: 'checkmark-circle-outline' as const };
    case 'clocked_in':
      return { bg: colors.primarySoft, text: colors.primaryDark, icon: 'time-outline' as const };
    case 'completed':
      return { bg: '#E2E8F0', text: colors.textMuted, icon: 'checkmark-done-outline' as const };
    case 'leave_pending':
      return { bg: '#FEF3C7', text: '#B45309', icon: 'document-text-outline' as const };
    case 'leave_approved':
      return { bg: '#D1FAE5', text: '#047857', icon: 'checkmark-circle-outline' as const };
    case 'not_started':
    default:
      return { bg: '#F1F5F9', text: colors.textMuted, icon: 'ellipse-outline' as const };
  }
}

function badgeLabelKey(kind: TodayShiftBadgeKind): string {
  switch (kind) {
    case 'not_punched':
      return 'shiftBadgeNotPunched';
    case 'clocked_in':
      return 'shiftBadgeClockedIn';
    case 'completed':
      return 'shiftBadgeCompleted';
    case 'leave_pending':
      return 'shiftBadgeLeavePending';
    case 'leave_approved':
      return 'shiftBadgeLeaveApproved';
    case 'not_started':
    default:
      return 'shiftBadgeNotStarted';
  }
}

export function TodayShiftRow({
  slot,
  index,
  workDateIso,
  todayIso,
  punch,
  pairPunch,
  punchesKnown = false,
  leaveRequestStatus = 'none',
  missedPunchApplyBlocked = false,
  leaveApplyBlocked = false,
  onApplyMissed,
  onApplyLeave,
}: Props) {
  const { t, i18n } = useTranslation();
  const menuWidth = i18n.language?.startsWith('en') ? 156 : 132;
  const [applyOpen, setApplyOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<LayoutRectangle | null>(null);
  const applyBtnRef = useRef<View>(null);

  const actions = getShiftCardActions(
    workDateIso,
    slot.range,
    punch,
    todayIso,
    getApproximateServerNowDate(),
    punchesKnown,
    slot.overnightRole ?? 'normal',
    pairPunch,
  );

  const badgeKind = getTodayShiftBadgeKind(
    workDateIso,
    slot,
    todayIso,
    punch,
    pairPunch,
    punchesKnown,
    leaveRequestStatus,
  );
  const badge = badgeStyle(badgeKind);
  const iconColor = ROW_ICON_COLORS[index % ROW_ICON_COLORS.length];
  const location = slot.areaName?.trim() || slot.shiftName?.trim() || '—';

  const showMissedApplyAvailable = actions.showMissedApply && !missedPunchApplyBlocked;
  const leaveApplyAvailable = !leaveApplyBlocked;
  const showApplyEntry = showMissedApplyAvailable || leaveApplyAvailable;

  const openApplyMenu = () => {
    applyBtnRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setApplyOpen(true);
    });
  };

  const closeApplyMenu = () => {
    setApplyOpen(false);
    setMenuAnchor(null);
  };

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: iconColor }]}>
          <Text style={styles.iconLetter}>{slot.shiftName?.trim().charAt(0).toUpperCase() || 'S'}</Text>
        </View>
        <View style={styles.main}>
          <Text style={styles.range}>{slot.range.replace(/[–—−‐‑‒-]/g, ' - ')}</Text>
          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
        </View>
        <View style={styles.right}>
          <View style={[styles.pill, styles.actionPill, { backgroundColor: badge.bg }]}>
            <Ionicons color={badge.text} name={badge.icon} size={11} />
            <Text style={[styles.pillText, { color: badge.text }]}>
              {t(badgeLabelKey(badgeKind))}
            </Text>
          </View>
          {showApplyEntry ? (
            <Pressable
              ref={applyBtnRef}
              accessibilityLabel={t('shiftApply')}
              accessibilityRole="button"
              hitSlop={6}
              onPress={openApplyMenu}
              style={({ pressed }) => [
                styles.pill,
                styles.actionPill,
                styles.applyPill,
                applyOpen && styles.applyPillOn,
                pressed && styles.applyPillPressed,
              ]}
            >
              <Ionicons color={colors.primaryDark} name="document-text-outline" size={11} />
              <Text style={[styles.pillText, styles.applyPillText]}>{t('shiftApply')}</Text>
              <Ionicons color={colors.primaryDark} name="chevron-down" size={10} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal
        transparent
        visible={applyOpen && menuAnchor != null}
        animationType="fade"
        onRequestClose={closeApplyMenu}
      >
        <Pressable accessibilityRole="button" style={styles.menuBackdrop} onPress={closeApplyMenu} />
        {menuAnchor ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.menuPopover,
              {
                width: menuWidth,
                top: menuAnchor.y + menuAnchor.height + 6,
                left: Math.min(
                  Dimensions.get('window').width - menuWidth - 12,
                  Math.max(12, menuAnchor.x + menuAnchor.width - menuWidth),
                ),
              },
            ]}
          >
            {showMissedApplyAvailable ? (
              <Pressable
                onPress={() => {
                  closeApplyMenu();
                  onApplyMissed();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  actions.emphasizeMissedApply && styles.menuItemHighlight,
                  !leaveApplyAvailable && styles.menuItemLast,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    actions.emphasizeMissedApply && styles.menuItemTextHighlight,
                  ]}
                >
                  {t('shiftApplyMissed')}
                </Text>
              </Pressable>
            ) : null}
            {leaveApplyAvailable ? (
              <Pressable
                onPress={() => {
                  closeApplyMenu();
                  onApplyLeave();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  styles.menuItemLast,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Text style={styles.menuItemText}>{t('shiftApplyLeave')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: { color: '#fff', fontSize: 15, fontWeight: '800' },
  main: { flex: 1, minWidth: 0 },
  range: { fontSize: 15, fontWeight: '700', color: colors.text },
  location: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textMuted },
  right: {
    flexDirection: 'column',
    alignItems: 'stretch',
    alignSelf: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: '46%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionPill: {
    minHeight: 28,
  },
  pillText: { fontSize: 10, fontWeight: '700', flexShrink: 0 },
  applyPill: {
    backgroundColor: colors.primarySoft,
  },
  applyPillOn: {
    borderColor: colors.primary,
  },
  applyPillPressed: { opacity: 0.85 },
  applyPillText: { color: colors.primaryDark },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  menuPopover: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemHighlight: { backgroundColor: '#FFF8E6' },
  menuItemPressed: { backgroundColor: colors.primarySoft },
  menuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  menuItemTextHighlight: { color: colors.warning, fontWeight: '800' },
});
