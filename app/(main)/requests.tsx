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

import { AttendanceReviewPrompt } from '../../src/components/AttendanceReviewPrompt';
import type { LeaveRequest } from '../../src/context/AuthContext';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import {
  formatShiftBindingLine,
  shiftSelectionKeyFromBinding,
} from '../../src/utils/requestShiftBinding';
import { useRefreshOnAppForeground } from '../../src/hooks/useRefreshOnAppForeground';
import { countPendingApprovals, shouldSplitRequestViews } from '../../src/utils/requestApproval';

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
  if (item.type === 'leave') return t('typeLeave');
  return t('typeMissedPunch');
}

export default function RequestsScreen() {
  const { t } = useTranslation();
  const {
    session,
    myAttendanceRequests,
    approvalAttendanceRequests,
    selectedStoreHasStoreManager,
    refreshAttendanceRequests,
    reviewAttendanceRequest,
  } = useAuth();
  const [listTab, setListTab] = useState<'approvals' | 'mine'>('mine');
  const [listLoading, setListLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; approved: boolean } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

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
    () => countPendingApprovals(approvalAttendanceRequests),
    [approvalAttendanceRequests],
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

  const submitReview = async (reviewComment: string) => {
    if (!reviewTarget) return;
    setReviewBusy(true);
    const res = await reviewAttendanceRequest(
      reviewTarget.id,
      reviewTarget.approved,
      reviewComment,
    );
    setReviewBusy(false);
    if (!res.ok) {
      Alert.alert(t('requestsRecords'), res.message ?? t('requestReviewFailed'));
      return;
    }
    setReviewTarget(null);
  };

  const openRequestDetail = (item: LeaveRequest, showApprovalActions: boolean) => {
    router.push({
      pathname: '/request-detail',
      params: { id: item.id, approval: showApprovalActions ? '1' : '0' },
    });
  };

  const renderRequestCard = (item: LeaveRequest, showApprovalActions: boolean) => (
    <View style={styles.card}>
      <Pressable
        onPress={() => openRequestDetail(item, showApprovalActions)}
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
      {showApprovalActions && item.applicantName ? (
        <Text style={styles.meta}>
          {t('requestsApplicant')}: {item.applicantName}
        </Text>
      ) : null}
      {item.type === 'leave' ? (
        <>
          <Text style={styles.meta}>
            {item.start === item.end
              ? t('requestWorkDate') + ': ' + item.start
              : t('leaveDateSpan', { start: item.start, end: item.end })}
          </Text>
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
      ) : (
        <>
          <Text style={styles.meta}>
            {t('requestWorkDate')}: {item.shifts[0]?.workDate}
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
      {showApprovalActions && item.status === 'pending' ? (
        <View style={styles.approvalActions}>
          <Pressable
            accessibilityLabel={t('requestReject')}
            onPress={() => setReviewTarget({ id: item.id, approved: false })}
            style={styles.rejectBtn}
          >
            <Text style={styles.rejectBtnText}>{t('requestReject')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('requestApprove')}
            onPress={() => setReviewTarget({ id: item.id, approved: true })}
            style={styles.approveBtn}
          >
            <Text style={styles.approveBtnText}>{t('requestApprove')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const listEmptyText = splitRequestViews
    ? listTab === 'approvals'
      ? t('requestsApprovalEmpty')
      : t('requestsMineEmpty')
    : t('requestsEmpty');

  const listHeader = splitRequestViews ? (
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
  ) : null;

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
        <AttendanceReviewPrompt
          busy={reviewBusy}
          onClose={() => {
            if (!reviewBusy) setReviewTarget(null);
          }}
          onConfirm={(reviewComment) => void submitReview(reviewComment)}
          target={reviewTarget ? { approved: reviewTarget.approved } : null}
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
  reason: { marginTop: 8, color: colors.text, fontSize: 14, lineHeight: 20 },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  rejectBtnText: { fontWeight: '800', color: colors.danger, fontSize: 14 },
  approveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  approveBtnText: { fontWeight: '800', color: '#fff', fontSize: 14 },
});
