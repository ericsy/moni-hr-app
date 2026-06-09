import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { normalizeSubmitReason } from '../../src/api/mapAttendanceRequest';
import { CalendarDatePickerModal } from '../../src/components/CalendarDatePickerModal';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import { calendarDateKey } from '../../src/utils/calendarDateKey';
import { formatPunchHeaderDate } from '../../src/utils/formatPunchTime';
import { addDaysLocal, compareDateKeys, parseDateKey } from '../../src/utils/localDateTime';
import { getApproximateServerNowDate } from '../../src/utils/serverClock';

const MAX_DAYS = 90;

export default function DateLeaveCreateScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { submitAttendanceRequest } = useAuth();
  const today = calendarDateKey(getApproximateServerNowDate());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<'start' | 'end' | null>(null);

  const dayCount = useMemo(() => {
    const a = parseDateKey(startDate);
    const b = parseDateKey(endDate);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  const shiftDate = (which: 'start' | 'end', delta: number) => {
    const base = which === 'start' ? startDate : endDate;
    const next = calendarDateKey(addDaysLocal(parseDateKey(base), delta));
    if (which === 'start') {
      setStartDate(next);
      if (parseDateKey(next) > parseDateKey(endDate)) setEndDate(next);
    } else {
      setEndDate(next);
      if (parseDateKey(next) < parseDateKey(startDate)) setStartDate(next);
    }
  };

  const applyCalendarDate = (which: 'start' | 'end', iso: string) => {
    const spanBetween = (a: string, b: string) => {
      const lo = compareDateKeys(a, b) <= 0 ? a : b;
      const hi = compareDateKeys(a, b) <= 0 ? b : a;
      return Math.round((parseDateKey(hi).getTime() - parseDateKey(lo).getTime()) / 86400000) + 1;
    };
    if (which === 'start') {
      const nextEnd = compareDateKeys(iso, endDate) > 0 ? iso : endDate;
      if (spanBetween(iso, nextEnd) > MAX_DAYS) {
        Alert.alert(t('dateLeaveTitle'), t('dateLeaveMaxDays', { max: MAX_DAYS }));
        return;
      }
      setStartDate(iso);
      if (compareDateKeys(iso, endDate) > 0) setEndDate(iso);
    } else {
      const nextStart = compareDateKeys(iso, startDate) < 0 ? iso : startDate;
      if (spanBetween(nextStart, iso) > MAX_DAYS) {
        Alert.alert(t('dateLeaveTitle'), t('dateLeaveMaxDays', { max: MAX_DAYS }));
        return;
      }
      setEndDate(iso);
      if (compareDateKeys(iso, startDate) < 0) setStartDate(iso);
    }
  };

  const submit = async () => {
    const reasonText = normalizeSubmitReason(reason);
    if (!reasonText) {
      Alert.alert(t('dateLeaveTitle'), t('requestReasonRequired'));
      return;
    }
    if (parseDateKey(startDate) > parseDateKey(endDate)) {
      Alert.alert(t('dateLeaveTitle'), t('dateLeaveEndBeforeStart'));
      return;
    }
    if (dayCount > MAX_DAYS) {
      Alert.alert(t('dateLeaveTitle'), t('dateLeaveMaxDays', { max: MAX_DAYS }));
      return;
    }
    setSubmitBusy(true);
    const res = await submitAttendanceRequest({
      type: 'leave',
      mode: 'date_range',
      reason: reasonText,
      leaveDateFrom: startDate,
      leaveDateTo: endDate,
    });
    setSubmitBusy(false);
    if (!res.ok) {
      Alert.alert(t('dateLeaveTitle'), res.message ?? t('requestSubmitFailed'));
      return;
    }
    // MIUI/Android 13：提交成功后立即切页更容易触发原生崩溃（键盘/动画/路由栈）。
    // 这里先 dismiss 键盘，再等交互结束后 replace 到申请记录，尽量降低风险。
    Keyboard.dismiss();
    const navigate = () => router.replace('/requests');
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => requestAnimationFrame(navigate), 300);
      });
    } else {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(navigate);
      });
    }
  };

  const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  return (
    <>
      <Stack.Screen options={{ title: t('dateLeaveTitle') }} />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>{t('dateLeaveHint')}</Text>

        <Text style={styles.label}>{t('dateLeaveFrom')}</Text>
        <View style={styles.dateRow}>
          <Pressable onPress={() => shiftDate('start', -1)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>−</Text>
          </Pressable>
          <Pressable
            onPress={() => setCalendarOpen('start')}
            style={styles.dateValueTap}
            accessibilityRole="button"
            accessibilityLabel={t('dateLeavePickCalendar')}
          >
            <Text style={styles.dateValue}>{formatPunchHeaderDate(startDate, lang)}</Text>
            <Ionicons color={colors.primary} name="calendar-outline" size={20} />
          </Pressable>
          <Pressable onPress={() => shiftDate('start', 1)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>+</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>{t('dateLeaveTo')}</Text>
        <View style={styles.dateRow}>
          <Pressable onPress={() => shiftDate('end', -1)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>−</Text>
          </Pressable>
          <Pressable
            onPress={() => setCalendarOpen('end')}
            style={styles.dateValueTap}
            accessibilityRole="button"
            accessibilityLabel={t('dateLeavePickCalendar')}
          >
            <Text style={styles.dateValue}>{formatPunchHeaderDate(endDate, lang)}</Text>
            <Ionicons color={colors.primary} name="calendar-outline" size={20} />
          </Pressable>
          <Pressable onPress={() => shiftDate('end', 1)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>+</Text>
          </Pressable>
        </View>

        <Text style={styles.meta}>{t('dateLeaveDayCount', { count: dayCount })}</Text>

        <Text style={styles.label}>{t('reason')}</Text>
        <TextInput
          multiline
          placeholder={t('reason')}
          style={styles.input}
          value={reason}
          onChangeText={setReason}
        />

        <Pressable
          disabled={submitBusy}
          onPress={() => void submit()}
          style={[styles.submit, submitBusy && styles.submitDisabled]}
        >
          {submitBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{t('submit')}</Text>
          )}
        </Pressable>
      </ScrollView>
      {calendarOpen ? (
        <CalendarDatePickerModal
          visible
          title={calendarOpen === 'end' ? t('dateLeaveTo') : t('dateLeaveFrom')}
          anchorIso={calendarOpen === 'end' ? endDate : startDate}
          minIso={calendarOpen === 'end' ? startDate : undefined}
          onRequestClose={() => setCalendarOpen(null)}
          onSelectDate={(iso) => applyCalendarDate(calendarOpen, iso)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: 8 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  dateBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: { fontSize: 22, fontWeight: '700', color: colors.primaryDark },
  dateValueTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  dateValue: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  meta: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  input: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
