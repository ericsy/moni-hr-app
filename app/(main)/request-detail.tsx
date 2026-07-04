import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  fetchAttendanceRequestDetail,
  fetchSubstituteCandidates,
  type SubstituteCandidate,
} from '../../src/api/attendance';
import { ApiError } from '../../src/api/client';
import {
  formatEmployeeBrief,
  mapAttendanceRequestDetail,
  type AttendanceRequestDetail,
} from '../../src/api/mapAttendanceRequest';
import type {
  AppAttendanceFieldImpact,
  AppAttendanceLeaveItem,
  FieldLeaveDispositionRequest,
  LeaveSubstitutionReviewItem,
} from '../../src/api/types';
import { AttendanceReviewPrompt } from '../../src/components/AttendanceReviewPrompt';
import { useAuth } from '../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { canReviewAttendanceRequest, isRequestApplicant } from '../../src/utils/requestApproval';
import { colors } from '../../src/theme/colors';
import { formatPunchHeaderDate, formatRequestDateTime } from '../../src/utils/formatPunchTime';
import { supportsLeaveFieldV1, supportsLeaveFieldV2 } from '../../src/utils/clientCapability';
import { buildFieldImpactDisplay, parseFieldImpactScheduleWindow } from '../../src/utils/formatFieldImpact';
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

function resolveEffectiveRequiredFieldImpacts(
  detail: AttendanceRequestDetail | null,
): AppAttendanceFieldImpact[] {
  if (!detail) return [];
  const required = (detail.fieldImpacts ?? []).filter((row) => row.requiredAction === 'required');
  if (required.length > 0) return required;
  if (detail.type !== 'leave' || detail.leaveMode !== 'field_job' || !detail.fieldJob?.id) return [];
  const jobId = Number(detail.fieldJob.id);
  if (!Number.isFinite(jobId) || jobId <= 0) return [];
  const range = (detail.fieldJob.scheduledRange ?? '').trim();
  const parts = range.split(/[–-]/).map((part) => part.trim()).filter(Boolean);
  const workDate = detail.start;
  const scheduledStart =
    workDate && parts[0] ? `${workDate}T${parts[0]}` : parts[0] || undefined;
  const scheduledEnd =
    workDate && parts[1] ? `${workDate}T${parts[1]}` : parts[1] || undefined;
  return [
    {
      fieldJobId: jobId,
      customerName: detail.fieldJob.customerName,
      scheduledStart,
      scheduledEnd,
      requiredAction: 'required',
    },
  ];
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
  const [substituteIdByLeaveItem, setSubstituteIdByLeaveItem] = useState<Record<string, string>>({});
  const [substituteCandidatesByLeaveItem, setSubstituteCandidatesByLeaveItem] = useState<
    Record<string, SubstituteCandidate[]>
  >({});
  const [substituteCandidatesLoading, setSubstituteCandidatesLoading] = useState<
    Record<string, boolean>
  >({});
  const [substitutePickerOpenFor, setSubstitutePickerOpenFor] = useState<string | null>(null);
  const [fieldActionByJobId, setFieldActionByJobId] = useState<
    Record<string, 'cancel' | 'reassign' | ''>
  >({});
  const [fieldAssigneeByJobId, setFieldAssigneeByJobId] = useState<Record<string, string>>({});
  const [fieldCandidatesByJobId, setFieldCandidatesByJobId] = useState<
    Record<string, SubstituteCandidate[]>
  >({});
  const [fieldCandidatesLoading, setFieldCandidatesLoading] = useState<Record<string, boolean>>({});
  const [fieldAssigneePickerOpenFor, setFieldAssigneePickerOpenFor] = useState<string | null>(
    null,
  );

  const requestId = params.id ?? '';
  const storeId = session?.user?.selectedStoreId ?? '';

  const showApprovalActions =
    detail != null &&
    canReviewAttendanceRequest(session?.user, storeId, detail, detail.applicant?.merchantAdminId);

  const effectiveRequiredFieldImpacts = useMemo(
    () => resolveEffectiveRequiredFieldImpacts(detail),
    [detail],
  );
  const showFieldDispositionEditor =
    showApprovalActions &&
    detail?.status === 'pending' &&
    detail?.type === 'leave' &&
    effectiveRequiredFieldImpacts.length > 0;
  const fieldLinkageSupported = useMemo(() => {
    if (detail?.leaveMode === 'field_job' || detail?.leaveMode === 'date_range') {
      return supportsLeaveFieldV2();
    }
    return supportsLeaveFieldV1();
  }, [detail?.leaveMode]);
  const approveBlockedByFieldLinkage =
    showFieldDispositionEditor && !fieldLinkageSupported;

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
        const mapped = mapAttendanceRequestDetail(row);
        setDetail(mapped);
        if (
          mapped.type === 'leave' &&
          mapped.status === 'pending' &&
          mapped.leaveMode !== 'date_range'
        ) {
          const next: Record<string, string> = {};
          for (const item of mapped.leaveItemsDetail ?? []) {
            if (item.id != null) next[String(item.id)] = '';
          }
          setSubstituteIdByLeaveItem(next);
        } else {
          setSubstituteIdByLeaveItem({});
        }
        const requiredJobs = resolveEffectiveRequiredFieldImpacts(mapped);
        if (requiredJobs.length > 0) {
          const actions: Record<string, 'cancel' | 'reassign' | ''> = {};
          const assignees: Record<string, string> = {};
          for (const row of requiredJobs) {
            const key = String(row.fieldJobId);
            actions[key] = '';
            assignees[key] = '';
          }
          setFieldActionByJobId(actions);
          setFieldAssigneeByJobId(assignees);
        } else {
          setFieldActionByJobId({});
          setFieldAssigneeByJobId({});
        }
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

  const loadSubstituteCandidates = useCallback(
    async (leaveItemId: string) => {
      if (!storeId || !leaveItemId) return;
      setSubstituteCandidatesLoading((prev) => ({ ...prev, [leaveItemId]: true }));
      try {
        const items = await fetchSubstituteCandidates(storeId, { leaveItemId });
        setSubstituteCandidatesByLeaveItem((prev) => ({ ...prev, [leaveItemId]: items }));
      } catch {
        setSubstituteCandidatesByLeaveItem((prev) => ({ ...prev, [leaveItemId]: [] }));
      } finally {
        setSubstituteCandidatesLoading((prev) => ({ ...prev, [leaveItemId]: false }));
      }
    },
    [storeId],
  );

  const loadFieldAssigneeCandidates = useCallback(
    async (fieldJobId: string, impact: AppAttendanceFieldImpact) => {
      if (!storeId || !fieldJobId) return;
      setFieldCandidatesLoading((prev) => ({ ...prev, [fieldJobId]: true }));
      try {
        const window = parseFieldImpactScheduleWindow(impact, i18n.language);
        const items = await fetchSubstituteCandidates(storeId, {
          scheduleDate: window.scheduleDate,
          startTime: window.startTime,
          endTime: window.endTime,
          excludeMerchantAdminId: detail?.applicantId,
        });
        setFieldCandidatesByJobId((prev) => ({ ...prev, [fieldJobId]: items }));
      } catch {
        setFieldCandidatesByJobId((prev) => ({ ...prev, [fieldJobId]: [] }));
      } finally {
        setFieldCandidatesLoading((prev) => ({ ...prev, [fieldJobId]: false }));
      }
    },
    [storeId, detail?.applicantId, i18n.language],
  );

  const buildFieldDispositions = (): FieldLeaveDispositionRequest[] | undefined => {
    if (!showFieldDispositionEditor) return undefined;
    const rows: FieldLeaveDispositionRequest[] = [];
    for (const impact of effectiveRequiredFieldImpacts) {
      const key = String(impact.fieldJobId);
      const action = fieldActionByJobId[key];
      if (action !== 'cancel' && action !== 'reassign') continue;
      const row: FieldLeaveDispositionRequest = {
        fieldJobId: impact.fieldJobId,
        action,
      };
      if (action === 'reassign') {
        const assignee = Number(fieldAssigneeByJobId[key]);
        if (!Number.isFinite(assignee) || assignee <= 0) continue;
        row.assigneeMerchantAdminId = assignee;
      }
      rows.push(row);
    }
    return rows.length > 0 ? rows : undefined;
  };

  const validateFieldDispositionsForApprove = (): string | null => {
    if (!showFieldDispositionEditor || !fieldLinkageSupported) return null;
    for (const impact of effectiveRequiredFieldImpacts) {
      const key = String(impact.fieldJobId);
      const action = fieldActionByJobId[key];
      if (action !== 'cancel' && action !== 'reassign') {
        return t('leaveFieldReviewIncomplete');
      }
      if (action === 'reassign') {
        const assignee = Number(fieldAssigneeByJobId[key]);
        if (!Number.isFinite(assignee) || assignee <= 0) {
          return t('leaveFieldReviewReassignRequired');
        }
      }
    }
    return null;
  };

  const buildSubstitutions = (): LeaveSubstitutionReviewItem[] | undefined => {
    if (!detail?.leaveItemsDetail?.length) return undefined;
    const items: LeaveSubstitutionReviewItem[] = [];
    for (const item of detail.leaveItemsDetail) {
      if (item.id == null) continue;
      const raw = substituteIdByLeaveItem[String(item.id)]?.trim();
      if (!raw) continue;
      const substituteMerchantAdminId = Number(raw);
      if (!Number.isFinite(substituteMerchantAdminId) || substituteMerchantAdminId <= 0) continue;
      items.push({
        leaveItemId: item.id,
        substituteMerchantAdminId,
        substituteStartTime: item.partialStartTime || item.shiftStartTime || undefined,
        substituteEndTime: item.partialEndTime || item.shiftEndTime || undefined,
      });
    }
    return items.length > 0 ? items : undefined;
  };

  const submitReview = async (reviewComment: string) => {
    if (!detail || !reviewTarget) return;
    if (reviewTarget.approved) {
      if (approveBlockedByFieldLinkage) {
        Alert.alert(t('requestDetailTitle'), t('leaveFieldReviewUpgrade'));
        return;
      }
      const fieldError = validateFieldDispositionsForApprove();
      if (fieldError) {
        Alert.alert(t('requestDetailTitle'), fieldError);
        return;
      }
    }
    setReviewBusy(true);
    const substitutions =
      reviewTarget.approved &&
      detail.type === 'leave' &&
      detail.leaveMode !== 'date_range' &&
      detail.leaveMode !== 'field_job'
        ? buildSubstitutions()
        : undefined;
    const fieldDispositions =
      reviewTarget.approved && showFieldDispositionEditor ? buildFieldDispositions() : undefined;
    const res = await reviewAttendanceRequest(
      detail.id,
      reviewTarget.approved,
      reviewComment,
      substitutions,
      fieldDispositions,
    );
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
    detail != null &&
    detail.status === 'pending' &&
    isRequestApplicant(session?.user?.id, detail, detail.applicant?.merchantAdminId);

  const statusLabel = detail ? statusLabelFor(detail.status, t) : '';

  const typeLabel =
    detail?.type === 'leave'
      ? detail.leaveMode === 'field_job'
        ? t('typeFieldLeave')
        : t('typeLeave')
      : t('typeMissedPunch');

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
                  <Text style={styles.sectionTitle}>
                    {detail.leaveMode === 'date_range'
                      ? t('dateLeaveTitle')
                      : t('requestDetailLeave')}
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{t('requestWorkDate')}</Text>
                    <Text style={styles.rowValue}>
                      {detail.start === detail.end
                        ? formatPunchHeaderDate(detail.start, i18n.language)
                        : t('leaveDateSpan', { start: detail.start, end: detail.end })}
                    </Text>
                  </View>
                  {detail.leaveMode === 'date_range' ? (
                    <Text style={styles.itemMeta}>{t('dateLeaveNoShiftHint')}</Text>
                  ) : detail.leaveMode === 'field_job' && detail.fieldJob ? (
                    <View style={styles.itemCard}>
                      <Text style={styles.itemTitle}>{detail.fieldJob.customerName}</Text>
                      <Text style={styles.itemMeta}>{detail.fieldJob.scheduledRange}</Text>
                      {detail.fieldJob.serviceAddress ? (
                        <Text style={styles.itemMeta}>{detail.fieldJob.serviceAddress}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {detail.leaveMode === 'date_range' || detail.leaveMode === 'field_job'
                    ? null
                    : (detail.leaveItemsDetail ?? []).map((item, idx) => {
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
                        {item.substitution?.substituteDisplayName ? (
                          <Text style={styles.itemMeta}>
                            {t('substituteLabel')}: {item.substitution.substituteDisplayName} (
                            {item.substitution.substituteStartTime}–{item.substitution.substituteEndTime})
                          </Text>
                        ) : null}
                        {showApprovalActions && detail.status === 'pending' && item.id != null ? (
                          <View style={styles.subPickerWrap}>
                            <Pressable
                              style={styles.subPickerTrigger}
                              onPress={() => {
                                const key = String(item.id);
                                const nextOpen = substitutePickerOpenFor === key ? null : key;
                                setSubstitutePickerOpenFor(nextOpen);
                                if (nextOpen) {
                                  void loadSubstituteCandidates(key);
                                }
                              }}
                            >
                              <Text style={styles.subPickerTriggerText}>
                                {(() => {
                                  const key = String(item.id);
                                  const selectedId = substituteIdByLeaveItem[key];
                                  if (!selectedId) return t('selectSubstitute');
                                  const found = substituteCandidatesByLeaveItem[key]?.find(
                                    (c) => String(c.id) === selectedId,
                                  );
                                  return found?.name || selectedId;
                                })()}
                              </Text>
                              <Ionicons
                                name={
                                  substitutePickerOpenFor === String(item.id)
                                    ? 'chevron-up'
                                    : 'chevron-down'
                                }
                                size={16}
                                color={colors.textMuted}
                              />
                            </Pressable>
                            {substitutePickerOpenFor === String(item.id) ? (
                              <View style={styles.subPickerList}>
                                {substituteCandidatesLoading[String(item.id)] ? (
                                  <ActivityIndicator
                                    color={colors.primary}
                                    style={styles.subPickerLoading}
                                  />
                                ) : (substituteCandidatesByLeaveItem[String(item.id)] ?? []).length === 0 ? (
                                  <Text style={styles.subPickerEmpty}>{t('substituteNoCandidates')}</Text>
                                ) : (
                                  (substituteCandidatesByLeaveItem[String(item.id)] ?? []).map(
                                    (candidate) => {
                                      const key = String(item.id);
                                      const selected =
                                        substituteIdByLeaveItem[key] === String(candidate.id);
                                      return (
                                        <Pressable
                                          key={String(candidate.id)}
                                          style={[
                                            styles.subPickerOption,
                                            selected && styles.subPickerOptionSelected,
                                          ]}
                                          onPress={() => {
                                            setSubstituteIdByLeaveItem((prev) => ({
                                              ...prev,
                                              [key]: String(candidate.id),
                                            }));
                                            setSubstitutePickerOpenFor(null);
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.subPickerOptionText,
                                              selected && styles.subPickerOptionTextSelected,
                                            ]}
                                          >
                                            {candidate.name}
                                          </Text>
                                        </Pressable>
                                      );
                                    },
                                  )
                                )}
                                {substituteIdByLeaveItem[String(item.id)] ? (
                                  <Pressable
                                    style={styles.subPickerClear}
                                    onPress={() => {
                                      const key = String(item.id);
                                      setSubstituteIdByLeaveItem((prev) => ({ ...prev, [key]: '' }));
                                      setSubstitutePickerOpenFor(null);
                                    }}
                                  >
                                    <Text style={styles.subPickerClearText}>{t('cancel')}</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
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
                      {detail.start
                        ? formatPunchHeaderDate(detail.start, i18n.language)
                        : '—'}
                    </Text>
                  </View>
                  {detail.fieldJob ? (
                    <>
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>{t('fieldJobMissedPunchTarget')}</Text>
                        <Text style={styles.rowValue}>{detail.fieldJob.customerName}</Text>
                      </View>
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>{t('missedPunchShift')}</Text>
                        <Text style={styles.rowValue}>{detail.fieldJob.scheduledRange}</Text>
                      </View>
                      {detail.fieldJob.serviceAddress ? (
                        <View style={styles.row}>
                          <Text style={styles.rowLabel}>{t('fieldJobAddressLabel')}</Text>
                          <Text style={styles.rowValue}>{detail.fieldJob.serviceAddress}</Text>
                        </View>
                      ) : null}
                      {detail.fieldJob.syncStoreClockIn || detail.fieldJob.syncStoreClockOut ? (
                        <Text style={styles.itemMeta}>{t('fieldJobMissedPunchSyncHint')}</Text>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>{t('requestShiftSegment')}</Text>
                      <Text style={styles.rowValue}>
                        {detail.shifts[0] ? formatShiftBindingLine(detail.shifts[0]) : '—'}
                      </Text>
                    </View>
                  )}
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

              {((detail.fieldImpacts?.length ?? 0) > 0 ||
                (detail.leaveMode === 'field_job' && effectiveRequiredFieldImpacts.length > 0)) ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {detail.leaveMode === 'field_job'
                      ? t('leaveFieldDispositionSection')
                      : t('leaveFieldImpactSection')}
                  </Text>
                  {(detail.leaveMode === 'field_job'
                    ? effectiveRequiredFieldImpacts
                    : detail.fieldImpacts ?? []
                  ).map((impact) => {
                    const key = String(impact.fieldJobId);
                    const row = buildFieldImpactDisplay(impact, t, i18n.language);
                    const saved = (detail.fieldDispositions ?? []).find(
                      (item) => item.fieldJobId === impact.fieldJobId,
                    );
                    return (
                      <View key={key} style={styles.itemCard}>
                        <Text style={styles.itemTitle}>{row.title}</Text>
                        <Text style={styles.itemMeta}>
                          {t('leaveFieldImpactDate')}: {row.dateLabel}
                        </Text>
                        <Text style={styles.itemMeta}>
                          {t('leaveFieldImpactTime')}: {row.rangeLabel}
                        </Text>
                        {row.serviceTypeLabel ? (
                          <Text style={styles.itemMeta}>
                            {t('fieldJobServiceType')}: {row.serviceTypeLabel}
                          </Text>
                        ) : null}
                        {row.overlapLabel ? (
                          <Text style={styles.itemMeta}>
                            {t('leaveFieldImpactOverlap')}: {row.overlapLabel}
                          </Text>
                        ) : null}
                        {row.syncLabel ? (
                          <Text style={styles.itemMeta}>{row.syncLabel}</Text>
                        ) : null}
                        <Text style={styles.itemMeta}>
                          {row.required
                            ? t('leaveFieldImpactRequired')
                            : t('leaveFieldImpactOptional')}
                        </Text>
                        {saved?.action ? (
                          <Text style={styles.itemMeta}>
                            {saved.action === 'reassign'
                              ? t('leaveFieldDispositionReassign')
                              : t('leaveFieldDispositionCancel')}
                            {saved.assigneeMerchantAdminId
                              ? ` (#${saved.assigneeMerchantAdminId})`
                              : ''}
                          </Text>
                        ) : null}
                        {showFieldDispositionEditor && row.required ? (
                          <View style={styles.fieldActionRow}>
                            <Pressable
                              style={[
                                styles.fieldActionBtn,
                                fieldActionByJobId[key] === 'cancel' && styles.fieldActionBtnActive,
                              ]}
                              onPress={() => {
                                setFieldActionByJobId((prev) => ({ ...prev, [key]: 'cancel' }));
                                setFieldAssigneeByJobId((prev) => ({ ...prev, [key]: '' }));
                                setFieldAssigneePickerOpenFor(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.fieldActionBtnText,
                                  fieldActionByJobId[key] === 'cancel' &&
                                    styles.fieldActionBtnTextActive,
                                ]}
                              >
                                {t('leaveFieldDispositionCancel')}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.fieldActionBtn,
                                fieldActionByJobId[key] === 'reassign' && styles.fieldActionBtnActive,
                              ]}
                              onPress={() => {
                                setFieldActionByJobId((prev) => ({ ...prev, [key]: 'reassign' }));
                              }}
                            >
                              <Text
                                style={[
                                  styles.fieldActionBtnText,
                                  fieldActionByJobId[key] === 'reassign' &&
                                    styles.fieldActionBtnTextActive,
                                ]}
                              >
                                {t('leaveFieldDispositionReassign')}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {showFieldDispositionEditor &&
                        row.required &&
                        fieldActionByJobId[key] === 'reassign' ? (
                          <View style={styles.subPickerWrap}>
                            <Pressable
                              style={styles.subPickerTrigger}
                              onPress={() => {
                                const nextOpen = fieldAssigneePickerOpenFor === key ? null : key;
                                setFieldAssigneePickerOpenFor(nextOpen);
                                if (nextOpen) {
                                  void loadFieldAssigneeCandidates(key, impact);
                                }
                              }}
                            >
                              <Text style={styles.subPickerTriggerText}>
                                {(() => {
                                  const selectedId = fieldAssigneeByJobId[key];
                                  if (!selectedId) return t('leaveFieldSelectAssignee');
                                  const found = fieldCandidatesByJobId[key]?.find(
                                    (c) => String(c.id) === selectedId,
                                  );
                                  return found?.name || selectedId;
                                })()}
                              </Text>
                              <Ionicons
                                name={
                                  fieldAssigneePickerOpenFor === key ? 'chevron-up' : 'chevron-down'
                                }
                                size={18}
                                color={colors.textMuted}
                              />
                            </Pressable>
                            {fieldAssigneePickerOpenFor === key ? (
                              <View style={styles.subPickerList}>
                                {fieldCandidatesLoading[key] ? (
                                  <View style={styles.subPickerLoading}>
                                    <ActivityIndicator color={colors.primary} />
                                  </View>
                                ) : (fieldCandidatesByJobId[key] ?? []).length === 0 ? (
                                  <Text style={styles.subPickerEmpty}>
                                    {t('leaveFieldNoAssignees')}
                                  </Text>
                                ) : (
                                  (fieldCandidatesByJobId[key] ?? []).map((candidate) => {
                                    const selected = fieldAssigneeByJobId[key] === String(candidate.id);
                                    return (
                                      <Pressable
                                        key={String(candidate.id)}
                                        style={[
                                          styles.subPickerOption,
                                          selected && styles.subPickerOptionSelected,
                                        ]}
                                        onPress={() => {
                                          setFieldAssigneeByJobId((prev) => ({
                                            ...prev,
                                            [key]: String(candidate.id),
                                          }));
                                          setFieldAssigneePickerOpenFor(null);
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.subPickerOptionText,
                                            selected && styles.subPickerOptionTextSelected,
                                          ]}
                                        >
                                          {candidate.name}
                                        </Text>
                                      </Pressable>
                                    );
                                  })
                                )}
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {approveBlockedByFieldLinkage ? (
                    <Text style={styles.upgradeHint}>{t('leaveFieldReviewUpgrade')}</Text>
                  ) : null}
                </View>
              ) : null}

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
                  disabled={reviewBusy || approveBlockedByFieldLinkage}
                  onPress={() => {
                    if (approveBlockedByFieldLinkage) {
                      Alert.alert(t('requestDetailTitle'), t('leaveFieldReviewUpgrade'));
                      return;
                    }
                    const fieldError = validateFieldDispositionsForApprove();
                    if (fieldError) {
                      Alert.alert(t('requestDetailTitle'), fieldError);
                      return;
                    }
                    setReviewTarget({ approved: true });
                  }}
                  style={[
                    styles.approveBtn,
                    (reviewBusy || approveBlockedByFieldLinkage) && styles.btnDisabled,
                  ]}
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
  subPickerWrap: { marginTop: 8 },
  subPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFBFD',
  },
  subPickerTriggerText: { fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  subPickerList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  subPickerLoading: { padding: 12 },
  subPickerEmpty: { padding: 12, fontSize: 13, color: colors.textMuted },
  subPickerOption: { paddingHorizontal: 12, paddingVertical: 10 },
  subPickerOptionSelected: { backgroundColor: '#EEF4FF' },
  subPickerOptionText: { fontSize: 14, color: colors.text },
  subPickerOptionTextSelected: { fontWeight: '700', color: colors.primary },
  subPickerClear: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: 10,
    alignItems: 'center',
  },
  subPickerClearText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
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
  fieldActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  fieldActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  fieldActionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#EEF4FF',
  },
  fieldActionBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  fieldActionBtnTextActive: { color: colors.primary, fontWeight: '800' },
  upgradeHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
    fontWeight: '600',
  },
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
