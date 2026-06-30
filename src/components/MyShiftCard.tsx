import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyPublishedShiftSlot } from '../api/mapPublishedSchedule';
import type { ShiftPunchRecord } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { getApproximateServerNowDate } from '../utils/serverClock';
import type {
  MissedPunchPendingStatus,
  ShiftMissedPunchOpenStatus,
} from '../utils/missedPunchEligibility';
import type { ShiftLeaveRequestStatus } from '../utils/leaveRequestEligibility';
import { getShiftCardActions } from '../utils/shiftClockWindow';

type Props = {
  slot: MyPublishedShiftSlot;
  workDateIso: string;
  todayIso: string;
  punch?: ShiftPunchRecord;
  /** 跨天末段：配对首段打卡（上班卡） */
  pairPunch?: ShiftPunchRecord;
  /** 当日打卡接口已成功返回 */
  punchesKnown?: boolean;
  punchBusy?: boolean;
  onClockIn: () => void | Promise<void>;
  onClockOut: () => void | Promise<void>;
  onApplyMissed: () => void;
  onApplyLeave: () => void;
  /** 该班次上班/下班漏打卡均已申请且未拒绝 */
  missedPunchApplyBlocked?: boolean;
  /** 打卡或漏打卡申请已覆盖班次时段，不可请假 */
  leaveApplyBlocked?: boolean;
  missedPunchPendingStatus?: MissedPunchPendingStatus;
  missedPunchOpen?: ShiftMissedPunchOpenStatus;
  /** 该班次关联的待审批/已通过请假（用于状态文案） */
  leaveRequestStatus?: ShiftLeaveRequestStatus;
};

export function MyShiftCard({
  slot,
  workDateIso,
  todayIso,
  punch,
  pairPunch,
  punchesKnown = false,
  punchBusy,
  onClockIn,
  onClockOut,
  onApplyMissed,
  onApplyLeave,
  missedPunchApplyBlocked = false,
  leaveApplyBlocked = false,
  missedPunchPendingStatus = 'none',
  missedPunchOpen,
  leaveRequestStatus = 'none',
}: Props) {
  const { t } = useTranslation();
  const [applyOpen, setApplyOpen] = useState(false);

  const displayRange = slot.range;
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

  let statusKey = actions.statusKey;
  let statusParams = actions.statusParams;
  let statusWarn = actions.emphasizeMissedApply;
  if (actions.showStatus && leaveRequestStatus === 'pending') {
    statusKey = 'shiftStatusLeavePending';
    statusParams = undefined;
    statusWarn = false;
  } else if (actions.showStatus && leaveRequestStatus === 'approved') {
    statusKey = 'shiftStatusLeaveApproved';
    statusParams = undefined;
    statusWarn = false;
  } else if (actions.showStatus && missedPunchOpen?.coverage === 'full') {
    statusKey =
      missedPunchOpen.approval === 'approved'
        ? 'shiftStatusMissedPunchApproved'
        : 'shiftStatusMissedPunchPending';
    statusParams = undefined;
    statusWarn = false;
  } else if (actions.showStatus && missedPunchOpen?.coverage === 'partial') {
    statusKey =
      missedPunchOpen.approval === 'approved'
        ? 'shiftStatusMissedPunchPartialApproved'
        : 'shiftStatusMissedPunchPartial';
    statusParams = undefined;
    statusWarn = false;
  } else if (actions.showStatus && missedPunchPendingStatus === 'full') {
    statusKey = 'shiftStatusMissedPunchPending';
    statusParams = undefined;
    statusWarn = false;
  } else if (actions.showStatus && missedPunchPendingStatus === 'partial') {
    statusKey = 'shiftStatusMissedPunchPartial';
    statusParams = undefined;
    statusWarn = false;
  }

  const statusText = actions.showStatus
    ? statusParams?.time
      ? t(statusKey, statusParams)
      : t(statusKey)
    : '';

  const showMissedApplyAvailable = actions.showMissedApply && !missedPunchApplyBlocked;
  const leaveApplyAvailable = !leaveApplyBlocked;
  const showApplyEntry = showMissedApplyAvailable || leaveApplyAvailable;
  const hasSideActions = actions.showClockIn || actions.showClockOut || showApplyEntry;

  return (
    <View style={styles.card}>
      <View style={styles.bodyRow}>
        <View style={styles.mainCol}>
          <View style={styles.timeRow}>
            <Text style={styles.cardTimeHero}>{displayRange}</Text>
            {slot.isSubstitution ? (
              <View style={styles.subBadge}>
                <Text style={styles.subBadgeText}>{t('scheduleSubstitutionBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardMetaLbl}>{t('scheduleRegion')}</Text>
          <Text style={styles.cardMetaVal}>{slot.areaName}</Text>
          <Text style={[styles.cardMetaLbl, styles.cardMetaLblAfter]}>{t('scheduleShift')}</Text>
          <Text style={styles.cardMetaVal}>{slot.shiftName}</Text>

          {actions.showStatus ? (
            <View style={styles.statusRow}>
              <Ionicons
                color={statusWarn ? colors.warning : colors.primary}
                name={statusWarn ? 'alert-circle-outline' : 'information-circle-outline'}
                size={15}
              />
              <Text style={[styles.statusText, statusWarn && styles.statusTextWarn]}>
                {statusText}
              </Text>
            </View>
          ) : null}
        </View>

        {hasSideActions ? (
          <View style={styles.actionsCol}>
            {actions.showClockIn ? (
              <Pressable
                accessibilityLabel={t('clockIn')}
                disabled={punchBusy}
                onPress={() => void onClockIn()}
                style={[styles.sideBtnPrimary, punchBusy && styles.sideBtnDisabled]}
              >
                {punchBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons color="#fff" name="log-in-outline" size={20} />
                    <Text style={styles.sideBtnPrimaryText}>{t('clockIn')}</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            {actions.showClockOut ? (
              <Pressable
                accessibilityLabel={t('clockOut')}
                disabled={punchBusy}
                onPress={() => void onClockOut()}
                style={[styles.sideBtnOutline, punchBusy && styles.sideBtnDisabled]}
              >
                {punchBusy ? (
                  <ActivityIndicator color={colors.primaryDark} size="small" />
                ) : (
                  <>
                    <Ionicons color={colors.primaryDark} name="log-out-outline" size={20} />
                    <Text style={styles.sideBtnOutlineText}>{t('clockOut')}</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            {showApplyEntry ? (
              <Pressable
                accessibilityLabel={t('shiftApply')}
                disabled={punchBusy}
                onPress={() => setApplyOpen((v) => !v)}
                style={[
                  styles.sideBtnApply,
                  applyOpen && styles.sideBtnApplyOn,
                  punchBusy && styles.sideBtnDisabled,
                ]}
              >
                <Ionicons color={colors.primaryDark} name="document-text-outline" size={20} />
                <Text style={styles.sideBtnApplyText}>{t('shiftApply')}</Text>
              </Pressable>
            ) : null}

            {applyOpen ? (
              <View style={styles.applyMenu}>
                {showMissedApplyAvailable ? (
                  <Pressable
                    onPress={() => {
                      setApplyOpen(false);
                      onApplyMissed();
                    }}
                    style={[
                      styles.applyItem,
                      actions.emphasizeMissedApply && styles.applyItemHighlight,
                      leaveApplyAvailable ? undefined : styles.applyItemLast,
                    ]}
                  >
                    <Text
                      style={[
                        styles.applyItemText,
                        actions.emphasizeMissedApply && styles.applyItemTextHighlight,
                      ]}
                    >
                      {t('shiftApplyMissed')}
                    </Text>
                  </Pressable>
                ) : null}
                {leaveApplyAvailable ? (
                  <Pressable
                    onPress={() => {
                      setApplyOpen(false);
                      onApplyLeave();
                    }}
                    style={[styles.applyItem, styles.applyItemLast]}
                  >
                    <Text style={styles.applyItemText}>{t('shiftApplyLeave')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const ACTION_COL_W = 76;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mainCol: { flex: 1, minWidth: 0 },
  actionsCol: {
    width: ACTION_COL_W,
    flexShrink: 0,
    alignItems: 'stretch',
    gap: 8,
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  cardTimeHero: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  cardMetaLbl: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  cardMetaLblAfter: { marginTop: 8 },
  cardMetaVal: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textMuted, lineHeight: 18 },
  subBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  subBadgeText: { fontSize: 11, fontWeight: '800', color: '#6d28d9' },
  statusRow: {
    marginTop: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
    lineHeight: 17,
  },
  statusTextWarn: { color: colors.warning },
  sideBtnPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.store,
  },
  sideBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  sideBtnOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  sideBtnOutlineText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  sideBtnApply: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFD',
  },
  sideBtnApplyOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  sideBtnApplyText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  sideBtnDisabled: { opacity: 0.55 },
  applyMenu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  applyItem: {
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  applyItemLast: { borderBottomWidth: 0 },
  applyItemHighlight: { backgroundColor: '#FFF8E6' },
  applyItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 15,
  },
  applyItemTextHighlight: { color: colors.warning, fontWeight: '800' },
});
