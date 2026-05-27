import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchAttendanceRequestDetail } from '../../src/api/attendance';
import { ApiError } from '../../src/api/client';
import {
  formatEmployeeBrief,
  mapAttendanceRequestDetail,
  type AttendanceRequestDetail,
} from '../../src/api/mapAttendanceRequest';
import type { AppAttendanceLeaveItem } from '../../src/api/types';
import { AttendanceReviewPrompt } from '../../src/components/AttendanceReviewPrompt';
import { useAuth } from '../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { colors } from '../../src/theme/colors';
import { formatPunchHeaderDate, formatRequestDateTime } from '../../src/utils/formatPunchTime';
import { formatShiftBindingLine } from '../../src/utils/requestShiftBinding';

function scheduleDateKey(value?: string | null): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function statusColor(status: AttendanceRequestDetail['status']) {
  if (status === 'approved') return colors.success;
  if (status === 'rejected') return colors.danger;
  if (status === 'cancelled') return colors.textMuted;
  return colors.warning;
}

function statusLabelFor(status: AttendanceRequestDetail['status'], t: (k: string) => string) {
  if (status === 'pending') return t('statusPending');
  if (status === 'approved') return t('statusApproved');
  if (status === 'rejected') return t('statusRejected');
  if (status === 'cancelled') return t('statusCancelled');
  return status;
}

function leaveEffectLabel(effect: string | undefined, t: (k: string) => string) {
  const e = (effect ?? '').toLowerCase();
  if (e === 'late_in') return t('requestLeaveEffectLateIn');
  if (e === 'early_out') return t('requestLeaveEffectEarlyOut');
  return t('leaveTimeFull');
}

function formatShiftRangeFromItem(item: AppAttendanceLeaveItem): string {
  const s = (item.shiftStartTime ?? '').trim();
  const e = (item.shiftEndTime ?? '').trim();
  if (s && e) return `${s}–${e}`;
  return s || e || '—';
}

export default function RequestDetailScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; approval?: string }>();
  const { session, reviewAttendanceRequest, cancelAttendanceRequest, refreshAttendanceRequests } =
    useAuth();

  const [detail, setDetail] = useState<AttendanceRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ approved: boolean } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const showApprovalActions = params.approval === '1';
  const requestId = params.id ?? '';
  const storeId = session?.user?.selectedStoreId ?? '';

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!storeId || !requestId) {
        setError(t('requestDetailLoadFailed'));
        setLoading(false);
        return;
      }
      if (!opts?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const row = await fetchAttendanceRequestDetail(storeId, requestId);
        setDetail(mapAttendanceRequestDetail(row));
      } catch (e) {
        const message = e instanceof ApiError ? e.message : t('requestDetailLoadFailed');
        setError(message);
        setDetail(null);
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [storeId, requestId, t],
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useRefreshOnAppForeground(() => loadDetail({ silent: true }));

  const submitReview = async (reviewComment: string) => {
    if (!detail || !reviewTarget) return;
    setReviewBusy(true);
    const res = await reviewAttendanceRequest(detail.id, reviewTarget.approved, reviewComment);
    setReviewBusy(false);
    if (!res.ok) {
      Alert.alert(t('requestDetailTitle'), res.message ?? t('requestReviewFailed'));
      return;
    }
    setReviewTarget(null);
    await refreshAttendanceRequests();
    router.back();
  };

  const onCancel = () => {
    if (!detail || detail.status !== 'pending') return;
    Alert.alert(t('requestCancelTitle'), t('requestCancelConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('requestCancel'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setCancelBusy(true);
            const res = await cancelAttendanceRequest(detail.id);
            setCancelBusy(false);
            if (!res.ok) {
              Alert.alert(t('requestDetailTitle'), res.message ?? t('requestCancelFailed'));
              return;
            }
            await refreshAttendanceRequests();
            router.back();
          })();
        },
      },
    ]);
  };

  const showCancelAction =
    !showApprovalActions && detail?.status === 'pending';

  const statusLabel = detail ? statusLabelFor(detail.status, t) : '';

  const typeLabel =
    detail?.type === 'leave' ? t('typeLeave') : t('typeMissedPunch');

  const renderPersonRow = (label: string, person?: { displayName?: string } | null) => {
    const name = formatEmployeeBrief(person ?? undefined);
    if (!name) return null;
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{name}</Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('requestDetailTitle'),
          headerShown: true,
          headerBackTitle: t('requestsRecords'),
        }}
      />
      <View style={styles.page}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadDetail()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : detail ? (
          <>
            <ScrollView
              contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom + 80 }]}
              showsVerticalScrollIndicator
            >
              <View style={styles.hero}>
                <Text style={styles.heroType}>{typeLabel}</Text>
                <View style={[styles.pill, { borderColor: statusColor(detail.status) }]}>
                  <Text style={[styles.pillText, { color: statusColor(detail.status) }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('requestDetailBasic')}</Text>
                {renderPersonRow(t('requestsApplicant'), detail.applicant)}
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('requestSubmittedAt')}</Text>
                  <Text style={styles.rowValue}>
                    {formatRequestDateTime(detail.submittedAt, i18n.language)}
                  </Text>
                </View>
                {detail.reviewedAt ? (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestReviewedAt')}</Text>
                    <Text style={styles.rowValue}>
                      {formatRequestDateTime(detail.reviewedAt, i18n.language)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {detail.type === 'leave' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('requestDetailLeave')}</Text>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestWorkDate')}</Text>
                    <Text style={styles.rowValue}>
                      {detail.start === detail.end
                        ? formatPunchHeaderDate(detail.start, i18n.language)
                        : t('leaveDateSpan', { start: detail.start, end: detail.end })}
                    </Text>
                  </View>
                  {(detail.leaveItemsDetail ?? []).map((item, idx) => {
                    const workDate = scheduleDateKey(item.scheduleDate) || detail.start;
                    const binding = {
                      workDate,
                      slotIndex: idx,
                      scheduleId: String(item.publishedCellId),
                      areaName: '—',
                      shiftName: '—',
                      scheduledRange: formatShiftRangeFromItem(item),
                    };
                    const partial =
                      item.partialStartTime && item.partialEndTime
                        ? `${item.partialStartTime} – ${item.partialEndTime}`
                        : null;
                    return (
                      <View key={`${item.publishedCellId}-${idx}`} style={styles.itemCard}>
                        <Text style={styles.itemTitle}>
                          {formatPunchHeaderDate(workDate, i18n.language)}
                        </Text>
                        <Text style={styles.itemMeta}>{formatShiftBindingLine(binding)}</Text>
                        <Text style={styles.itemMeta}>
                          {t('requestLeaveEffect')}: {leaveEffectLabel(item.leaveEffect, t)}
                        </Text>
                        {partial ? (
                          <Text style={styles.itemMeta}>
                            {t('leaveTimeSpan', {
                              from: item.partialStartTime!,
                              to: item.partialEndTime!,
                            })}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('requestDetailMissedPunch')}</Text>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestWorkDate')}</Text>
                    <Text style={styles.rowValue}>
                      {detail.shifts[0]?.workDate
                        ? formatPunchHeaderDate(detail.shifts[0].workDate, i18n.language)
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestShiftSegment')}</Text>
                    <Text style={styles.rowValue}>
                      {detail.shifts[0] ? formatShiftBindingLine(detail.shifts[0]) : '—'}
                    </Text>
                  </View>
                  {detail.missedPunch ? (
                    <>
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>{t('missedPunchKind')}</Text>
                        <Text style={styles.rowValue}>
                          {detail.missedPunch.punchKind === 'in' ? t('clockIn') : t('clockOut')}
                        </Text>
                      </View>
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>{t('missedPunchProposedTime')}</Text>
                        <Text style={styles.rowValue}>{detail.missedPunch.proposedTime}</Text>
                      </View>
                    </>
                  ) : null}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('reason')}</Text>
                <Text style={styles.reasonBody}>{detail.reason}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('requestDetailApproval')}</Text>
                {renderPersonRow(t('requestApprover'), detail.approver)}
                {detail.approverKind ? (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestApproverKind')}</Text>
                    <Text style={styles.rowValue}>{detail.approverKind}</Text>
                  </View>
                ) : null}
                {renderPersonRow(t('requestReviewer'), detail.reviewer)}
                {detail.proxyReview && detail.proxyReviewer
                  ? renderPersonRow(t('requestProxyReviewer'), detail.proxyReviewer)
                  : null}
                {detail.reviewComment?.trim() ? (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestReviewComment')}</Text>
                    <Text style={styles.rowValueMultiline}>{detail.reviewComment.trim()}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            {showCancelAction ? (
              <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
                <Pressable
                  disabled={cancelBusy}
                  onPress={onCancel}
                  style={[styles.cancelBtn, cancelBusy && styles.btnDisabled]}
                >
                  {cancelBusy ? (
                    <ActivityIndicator color={colors.danger} size="small" />
                  ) : (
                    <Text style={styles.cancelBtnText}>{t('requestCancel')}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
            {showApprovalActions && detail.status === 'pending' ? (
              <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
                <Pressable
                  disabled={reviewBusy}
                  onPress={() => setReviewTarget({ approved: false })}
                  style={[styles.rejectBtn, reviewBusy && styles.btnDisabled]}
                >
                  <Text style={styles.rejectBtnText}>{t('requestReject')}</Text>
                </Pressable>
                <Pressable
                  disabled={reviewBusy}
                  onPress={() => setReviewTarget({ approved: true })}
                  style={[styles.approveBtn, reviewBusy && styles.btnDisabled]}
                >
                  <Text style={styles.approveBtnText}>{t('requestApprove')}</Text>
                </Pressable>
              </View>
            ) : null}
            <AttendanceReviewPrompt
              busy={reviewBusy}
              onClose={() => {
                if (!reviewBusy) setReviewTarget(null);
              }}
              onConfirm={(reviewComment) => void submitReview(reviewComment)}
              target={reviewTarget}
            />
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: { color: '#fff', fontWeight: '800' },
  scroll: { padding: 20, gap: 12 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroType: { fontSize: 20, fontWeight: '800', color: colors.text },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  row: { marginTop: 8 },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  rowValue: { marginTop: 2, fontSize: 15, fontWeight: '600', color: colors.text },
  rowValueMultiline: { marginTop: 2, fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 22 },
  itemCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTitle: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  itemMeta: { marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  reasonBody: { fontSize: 15, color: colors.text, lineHeight: 22 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  rejectBtnText: { fontWeight: '800', color: colors.danger, fontSize: 14 },
  approveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  approveBtnText: { fontWeight: '800', color: '#fff', fontSize: 14 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  cancelBtnText: { fontWeight: '800', color: colors.danger, fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
});
