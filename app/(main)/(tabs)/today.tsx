import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { ApiError } from '../../../src/api/client';
import { fetchTodayWorkSummary, postWorkPunch } from '../../../src/api/todayWork';
import { TodayPunchActionButton } from '../../../src/components/today/TodayPunchActionButton';
import { TodayWorkTimeline } from '../../../src/components/today/TodayWorkTimeline';
import { getActiveStore, useAuth } from '../../../src/context/AuthContext';
import { useRefreshOnAppForeground } from '../../../src/hooks/useRefreshOnAppForeground';
import { colors } from '../../../src/theme/colors';
import type { CurrentPunchAction, EmployeePunchPayload, TodayWorkSummary } from '../../../src/types/fieldService';
import { calendarDateKey } from '../../../src/utils/calendarDateKey';
import { formatSelectedHeaderLine } from '../../../src/utils/localeDateFormat';
import { getPunchDeviceId } from '../../../src/utils/punchDevice';
import { getApproximateServerNowDate } from '../../../src/utils/serverClock';

function mapActionToPunchType(action: CurrentPunchAction['action']): EmployeePunchPayload['punchType'] | null {
  if (action === 'STORE_CLOCK_IN' || action === 'FIELD_CLOCK_IN' || action === 'FIELD_CLOCK_IN_SYNC_STORE') {
    return 'clock_in';
  }
  if (action === 'STORE_CLOCK_OUT' || action === 'FIELD_CLOCK_OUT' || action === 'FIELD_CLOCK_OUT_SYNC_STORE') {
    return 'clock_out';
  }
  return null;
}

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const selectedStoreId = session?.user?.selectedStoreId ?? '';

  const todayIso = calendarDateKey(getApproximateServerNowDate());
  const selectedHeaderLine = useMemo(
    () => formatSelectedHeaderLine(new Date(getApproximateServerNowDate()), i18n.language),
    [i18n.language, todayIso],
  );

  const [summary, setSummary] = useState<TodayWorkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (asRefresh = false) => {
      if (!selectedStoreId) {
        setSummary(null);
        setErrorText(t('punchErrorNoStore'));
        return;
      }
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText(null);
      try {
        const data = await fetchTodayWorkSummary({ storeId: selectedStoreId, date: todayIso });
        setSummary(data);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : t('todayLoadFailed');
        setErrorText(message);
      } finally {
        if (asRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [selectedStoreId, todayIso, t],
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useRefreshOnAppForeground(() => loadSummary(true));

  const onRefresh = useCallback(async () => {
    await loadSummary(true);
  }, [loadSummary]);

  const onPunch = useCallback(async () => {
    if (!summary || !selectedStoreId) return;
    const action = summary.currentPunchAction;
    const punchType = mapActionToPunchType(action.action);
    if (!punchType || !action.refType || !action.refId) return;

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('tabToday'), t('clockPermissionDenied'));
      return;
    }

    setPunchBusy(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const data = await postWorkPunch({
        storeId: selectedStoreId,
        payload: {
          refType: action.refType,
          refId: action.refId,
          punchType,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          deviceId: getPunchDeviceId(),
        },
      });
      setSummary(data);
      Alert.alert(t('tabToday'), t('punchSuccess'));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('punchFailed');
      Alert.alert(t('tabToday'), message);
    } finally {
      setPunchBusy(false);
    }
  }, [summary, selectedStoreId, t]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        style={styles.pageScroll}
        alwaysBounceVertical
        contentContainerStyle={[styles.pageContent, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('tabToday')}</Text>
            <Ionicons color={colors.primarySoft} name="calendar" size={52} />
          </View>
          <View style={styles.metaRow}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={16} />
            <Text style={styles.metaText}>{selectedHeaderLine}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons color={colors.textMuted} name="business-outline" size={16} />
            <Text style={styles.metaText} numberOfLines={1}>
              {getActiveStore(session?.user)?.name ?? '-'}
            </Text>
          </View>
        </View>

        {loading && !summary ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.centerText}>{t('todayLoading')}</Text>
          </View>
        ) : errorText ? (
          <View style={styles.centerWrap}>
            <Ionicons color={colors.textMuted} name="alert-circle-outline" size={44} />
            <Text style={styles.centerText}>{errorText}</Text>
          </View>
        ) : summary ? (
          <>
            <View style={styles.heroWrap}>
              <TodayPunchActionButton action={summary.currentPunchAction} busy={punchBusy} onPress={onPunch} />
            </View>
            <View style={styles.timelinePanel}>
              <View style={styles.panelHead}>
                <View style={styles.panelBar} />
                <Text style={styles.panelTitle}>{t('todayTimelineTitle')}</Text>
              </View>
              <TodayWorkTimeline timeline={summary.timeline} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pageScroll: { flex: 1 },
  pageContent: { flexGrow: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaText: { fontSize: 14, fontWeight: '600', color: colors.textMuted, flex: 1 },
  heroWrap: { marginHorizontal: 20, marginTop: 10 },
  timelinePanel: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary },
  panelTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 10,
  },
  centerText: { fontSize: 15, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
});
