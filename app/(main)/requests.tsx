import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { LeaveRequest } from '../../src/context/AuthContext';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import {
  formatShiftBindingLine,
  shiftSelectionKeyFromBinding,
} from '../../src/utils/requestShiftBinding';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { countPendingApprovalsForManager, shouldSplitRequestViews } from '../../src/utils/requestApproval';

function statusColor(status: LeaveRequest['status']) {
  if (status === 'approved') return colors.success;
  if (status === 'rejected') return colors.danger;
  if (status === 'cancelled') return colors.textMuted;
  return colors.warning;
}

function statusLabel(status: LeaveRequest['status'], t: (k: string) => string) {
  if (status === 'pending') return t('statusPending');
  if (status === 'approved') return t('statusApproved');
  if (status === 'rejected') return t('statusRejected');
  if (status === 'cancelled') return t('statusCancelled');
  return status;
}

function requestTypeLabel(item: LeaveRequest, t: (k: string) => string) {
  if (item.type === 'leave' && item.leaveMode === 'field_job') return t('typeFieldLeave');
  if (item.type === 'leave' && item.leaveMode === 'date_range') return t('dateLeaveTitle');
  if (item.type === 'leave') return t('typeLeave');
  return t('typeMissedPunch');
}

function formatLeaveWorkDateValue(item: LeaveRequest, t: (k: string) => string): string {
  return item.start === item.end
    ? item.start
    : t('leaveDateSpan', { start: item.start, end: item.end });
}

function renderLabeledMetaRow(
  label: string,
  value: string,
  options?: { numberOfLines?: number },
) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaRowLabel}>{label}:</Text>
      <Text numberOfLines={options?.numberOfLines} style={styles.metaRowValue}>
        {value}
      </Text>
    </View>
  );
}

function renderFieldJobListMeta(
  fieldJob: NonNullable<LeaveRequest['fieldJob']>,
  t: (k: string) => string,
) {
  const range = fieldJob.scheduledRange?.trim();
  const showRange = Boolean(range && range !== '—');
  const address = fieldJob.serviceAddress?.trim();
  return (
    <>
      {renderLabeledMetaRow(t('fieldJobLeaveTarget'), fieldJob.customerName)}
      {showRange ? renderLabeledMetaRow(t('requestShiftSegment'), range!) : null}
      {address ? renderLabeledMetaRow(t('fieldJobAddressLabel'), address, { numberOfLines: 2 }) : null}
    </>
  );
}

export default function RequestsScreen() {
  const { t } = useTranslation();
  const {
    session,
    myAttendanceRequests,
    approvalAttendanceRequests,
    selectedStoreHasStoreManager,
    refreshAttendanceRequests,
  } = useAuth();
  const [listTab, setListTab] = useState<'approvals' | 'mine'>('mine');
  const [listLoading, setListLoading] = useState(false);

  const selectedStoreId = session?.user?.selectedStoreId ?? '';
  const user = session?.user;

  const storeManagerHint = useMemo(
    () => ({ storeHasStoreManager: selectedStoreHasStoreManager }),
    [selectedStoreHasStoreManager],
  );

  const splitRequestViews = useMemo(
    () => shouldSplitRequestViews(user, selectedStoreId, approvalAttendanceRequests, storeManagerHint),
    [user, selectedStoreId, approvalAttendanceRequests, storeManagerHint],
  );

  const pendingApprovalCount = useMemo(
    () => countPendingApprovalsForManager(approvalAttendanceRequests, user?.id),
    [approvalAttendanceRequests, user?.id],
  );

  const listData = useMemo(() => {
    if (!user) return [];
    return splitRequestViews
      ? listTab === 'approvals'
        ? approvalAttendanceRequests
        : myAttendanceRequests
      : myAttendanceRequests;
  }, [user, splitRequestViews, listTab, approvalAttendanceRequests, myAttendanceRequests]);

  const loadRequests = useCallback(async () => {
    if (!selectedStoreId) return;
    setListLoading(true);
    const res = await refreshAttendanceRequests();
    setListLoading(false);
    if (!res.ok && res.message) {
      Alert.alert(t('requestsRecords'), res.message);
    }
  }, [selectedStoreId, refreshAttendanceRequests, t]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  useRefreshOnAppForeground(loadRequests);

  useEffect(() => {
    if (!splitRequestViews) setListTab('mine');
  }, [splitRequestViews]);

  const listTabBootstrapped = useRef(false);
  useEffect(() => {
    if (!splitRequestViews) {
      listTabBootstrapped.current = false;
      return;
    }
    if (!listTabBootstrapped.current && pendingApprovalCount > 0) {
      setListTab('approvals');
      listTabBootstrapped.current = true;
    }
  }, [splitRequestViews, pendingApprovalCount]);

  const openRequestDetail = (item: LeaveRequest) => {
    router.push({
      pathname: '/request-detail',
      params: { id: item.id },
    });
  };

  const renderRequestCard = (item: LeaveRequest, fromApprovalsTab: boolean) => (
    <View style={styles.card}>
      <Pressable
        onPress={() => openRequestDetail(item)}
        style={({ pressed }) => [styles.cardBody, pressed && styles.cardPressed]}
      >
      <View style={styles.cardTop}>
        <Text style={styles.type}>{requestTypeLabel(item, t)}</Text>
        <View style={[styles.pill, { borderColor: statusColor(item.status) }]}>
          <Text style={[styles.pillText, { color: statusColor(item.status) }]}>
            {statusLabel(item.status, t)}
          </Text>
        </View>
      </View>
      {fromApprovalsTab && item.applicantName ? (
        <Text style={styles.meta}>
          {t('requestsApplicant')}: {item.applicantName}
        </Text>
      ) : null}
      {item.type === 'leave' ? (
        item.leaveMode === 'field_job' && item.fieldJob ? (
          <>
            {renderLabeledMetaRow(t('requestWorkDate'), formatLeaveWorkDateValue(item, t))}
            {renderFieldJobListMeta(item.fieldJob, t)}
          </>
        ) : (
          <>
            <Text style={styles.meta}>
              {t('requestWorkDate') + ': '}
              {item.start === item.end
                ? item.start
                : t('leaveDateSpan', { start: item.start, end: item.end })}
            </Text>
            {(item.leaveMode === 'date_range' || item.shifts.length === 0) ? null : (
              <>
                <Text style={styles.meta}>
                  {t('leaveShiftCount', { count: item.shifts.length })}
                </Text>
                {item.shifts.map((s) => (
                  <Text key={shiftSelectionKeyFromBinding(s)} style={styles.metaSub}>
                    · {s.workDate} {formatShiftBindingLine(s)}
                    {item.shifts.length === 1 &&
                    item.leaveTime?.mode === 'partial' &&
                    item.leaveTime.from &&
                    item.leaveTime.to
                      ? ` · ${t('leaveTimeSpan', { from: item.leaveTime.from, to: item.leaveTime.to })}`
                      : ''}
                  </Text>
                ))}
              </>
            )}
          </>
        )
      ) : item.fieldJob ? (
        <>
          {renderLabeledMetaRow(
            t('requestWorkDate'),
            item.shifts[0]?.workDate ?? item.start,
          )}
          {renderFieldJobListMeta(item.fieldJob, t)}
          {item.missedPunch ? (
            <Text style={styles.meta}>
              {t('missedPunchKind')}:{' '}
              {item.missedPunch.punchKind === 'in' ? t('clockIn') : t('clockOut')} ·{' '}
              {t('missedPunchProposedTime')}: {item.missedPunch.proposedTime}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.meta}>
            {t('requestWorkDate')}: {item.shifts[0]?.workDate ?? item.start}
          </Text>
          <Text style={styles.meta}>
            {t('requestShiftSegment')}:{' '}
            {item.shifts[0] ? formatShiftBindingLine(item.shifts[0]) : '—'}
          </Text>
          {item.missedPunch ? (
            <Text style={styles.meta}>
              {t('missedPunchKind')}:{' '}
              {item.missedPunch.punchKind === 'in' ? t('clockIn') : t('clockOut')} ·{' '}
              {t('missedPunchProposedTime')}: {item.missedPunch.proposedTime}
            </Text>
          ) : null}
        </>
      )}
      <Text style={styles.reason}>{item.reason}</Text>
      <View style={styles.cardChevron}>
        <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
      </View>
      </Pressable>
    </View>
  );

  const listEmptyText = splitRequestViews
    ? listTab === 'approvals'
      ? t('requestsApprovalEmpty')
      : t('requestsMineEmpty')
    : t('requestsEmpty');

  const listHeader = (
    <View style={styles.listHeaderWrap}>
      <Pressable
        accessibilityLabel={t('dateLeaveTitle')}
        accessibilityRole="button"
        onPress={() => router.push('/date-leave-create')}
        style={({ pressed }) => [styles.dateLeaveEntry, pressed && styles.dateLeaveEntryPressed]}
      >
        <Ionicons color={colors.primary} name="calendar-outline" size={18} />
        <Text style={styles.dateLeaveEntryText}>{t('dateLeaveTitle')}</Text>
        <Ionicons color={colors.primary} name="chevron-forward" size={16} />
      </Pressable>
      {splitRequestViews ? (
        <View style={styles.listTabs}>
          <Pressable
            onPress={() => setListTab('approvals')}
            style={[styles.listTab, listTab === 'approvals' && styles.listTabActive]}
          >
            <Text style={[styles.listTabText, listTab === 'approvals' && styles.listTabTextActive]}>
              {t('requestsTabApprovals')}
            </Text>
            {pendingApprovalCount > 0 ? (
              <View style={styles.listTabBadge}>
                <Text style={styles.listTabBadgeText}>
                  {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setListTab('mine')}
            style={[styles.listTab, listTab === 'mine' && styles.listTabActive]}
          >
            <Text style={[styles.listTabText, listTab === 'mine' && styles.listTabTextActive]}>
              {t('requestsTabMine')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('requestsRecords'),
          headerShown: true,
          headerBackTitle: t('tabSchedule'),
        }}
      />
      <View style={styles.safe}>
        <FlatList
          style={styles.listFlex}
          contentContainerStyle={[styles.list, styles.listContentGrow]}
          data={listData}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          refreshControl={
            <RefreshControl
              refreshing={listLoading}
              onRefresh={() => void loadRequests()}
              tintColor={colors.primary}
              colors={[colors.primary]}
              title=""
            />
          }
          ListEmptyComponent={
            listLoading ? null : <Text style={styles.emptyList}>{listEmptyText}</Text>
          }
          renderItem={({ item }) =>
            renderRequestCard(item, splitRequestViews && listTab === 'approvals')
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  listFlex: { flex: 1 },
  listContentGrow: { flexGrow: 1 },
  listTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  listTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  listTabActive: { backgroundColor: colors.primarySoft },
  listTabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  listTabTextActive: { color: colors.primaryDark },
  listTabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTabBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 12, paddingBottom: 40 },
  listHeaderWrap: { gap: 12, marginBottom: 4 },
  dateLeaveEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateLeaveEntryPressed: { opacity: 0.92 },
  dateLeaveEntryText: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  emptyList: { textAlign: 'center', color: colors.textMuted, fontSize: 15, paddingVertical: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBody: {
    padding: 16,
    paddingRight: 36,
    position: 'relative',
  },
  cardPressed: { opacity: 0.92 },
  cardChevron: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  type: { fontSize: 16, fontWeight: '700', color: colors.text },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  pillText: { fontSize: 11, fontWeight: '800' },
  meta: { marginTop: 8, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  metaSub: { marginTop: 4, marginLeft: 4, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  metaRowLabel: {
    width: 64,
    flexShrink: 0,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRowValue: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  reason: { marginTop: 8, color: colors.text, fontSize: 14, lineHeight: 20 },
});
