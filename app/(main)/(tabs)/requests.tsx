import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LeaveRequest } from '../../../src/context/AuthContext';
import { useAuth } from '../../../src/context/AuthContext';
import { getMyShiftsForDay } from '../../../src/data/demoMyShifts';
import { colors } from '../../../src/theme/colors';
import { calendarDateKey } from '../../../src/utils/calendarDateKey';

function statusColor(status: LeaveRequest['status']) {
  if (status === 'approved') return colors.success;
  if (status === 'rejected') return colors.danger;
  return colors.warning;
}

function requestTypeLabel(item: LeaveRequest, t: (k: string) => string) {
  if (item.type === 'leave') return t('typeLeave');
  if (item.type === 'swap') return t('typeSwap');
  return t('typeMissedPunch');
}

export default function RequestsScreen() {
  const { t } = useTranslation();
  const { requests, addRequest } = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveRequest['type']>('leave');
  const [start, setStart] = useState('2026-05-20');
  const [end, setEnd] = useState('2026-05-20');
  const [reason, setReason] = useState('');

  const [workDate, setWorkDate] = useState('2026-05-13');
  const [slotIndex, setSlotIndex] = useState(0);
  const [punchKind, setPunchKind] = useState<'in' | 'out'>('in');
  const [proposedTime, setProposedTime] = useState('08:30');

  const daySlots = useMemo(() => getMyShiftsForDay(workDate), [workDate]);
  const selectedSlot = daySlots[slotIndex];

  const resetMissedPunchFields = (date: string) => {
    const slots = getMyShiftsForDay(date);
    setSlotIndex(0);
    if (slots[0]) {
      const startPart = slots[0].range.split(/[–-]/)[0]?.trim() ?? '09:00';
      setProposedTime(startPart);
    }
  };

  const onWorkDateChange = (date: string) => {
    setWorkDate(date);
    resetMissedPunchFields(date);
  };

  const onCreate = () => {
    if (type === 'missed_punch') {
      if (!selectedSlot) return;
      addRequest({
        type: 'missed_punch',
        start: workDate,
        end: workDate,
        reason: reason || '—',
        missedPunch: {
          workDate,
          slotIndex,
          region: selectedSlot.region,
          shiftKey: selectedSlot.shiftKey,
          scheduledRange: selectedSlot.range,
          punchKind,
          proposedTime: proposedTime.trim(),
        },
      });
    } else {
      addRequest({ type, start, end, reason: reason || '—' });
    }
    setOpen(false);
    setReason('');
  };

  const openNew = () => {
    setType('leave');
    setStart(calendarDateKey(new Date()));
    setEnd(calendarDateKey(new Date()));
    setWorkDate('2026-05-13');
    resetMissedPunchFields('2026-05-13');
    setPunchKind('in');
    setOpen(true);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('requestsTitle')}</Text>
        <Pressable onPress={openNew} style={styles.primarySm}>
          <Text style={styles.primarySmText}>{t('newRequest')}</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.type}>{requestTypeLabel(item, t)}</Text>
              <View style={[styles.pill, { borderColor: statusColor(item.status) }]}>
                <Text style={[styles.pillText, { color: statusColor(item.status) }]}>
                  {item.status === 'pending'
                    ? t('statusPending')
                    : item.status === 'approved'
                      ? t('statusApproved')
                      : t('statusRejected')}
                </Text>
              </View>
            </View>
            {item.type === 'missed_punch' && item.missedPunch ? (
              <>
                <Text style={styles.meta}>
                  {t('missedPunchWorkDate')}: {item.missedPunch.workDate}
                </Text>
                <Text style={styles.meta}>
                  {t('missedPunchShift')}: {t(item.missedPunch.region)} · {t(item.missedPunch.shiftKey)} ·{' '}
                  {item.missedPunch.scheduledRange}
                </Text>
                <Text style={styles.meta}>
                  {t('missedPunchKind')}:{' '}
                  {item.missedPunch.punchKind === 'in' ? t('clockIn') : t('clockOut')} ·{' '}
                  {t('missedPunchProposedTime')}: {item.missedPunch.proposedTime}
                </Text>
              </>
            ) : (
              <Text style={styles.meta}>
                {t('start')}: {item.start} · {t('end')}: {item.end}
              </Text>
            )}
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        )}
      />

      <Modal animationType="slide" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScroll}
          >
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{t('newRequest')}</Text>

              <Text style={styles.label}>{t('requestType')}</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => setType('leave')}
                  style={[styles.chip, type === 'leave' && styles.chipOn]}
                >
                  <Text style={[styles.chipText, type === 'leave' && styles.chipTextOn]}>{t('typeLeave')}</Text>
                </Pressable>
                <Pressable onPress={() => setType('swap')} style={[styles.chip, type === 'swap' && styles.chipOn]}>
                  <Text style={[styles.chipText, type === 'swap' && styles.chipTextOn]}>{t('typeSwap')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setType('missed_punch');
                    resetMissedPunchFields(workDate);
                  }}
                  style={[styles.chip, type === 'missed_punch' && styles.chipOn]}
                >
                  <Text style={[styles.chipText, type === 'missed_punch' && styles.chipTextOn]}>
                    {t('typeMissedPunch')}
                  </Text>
                </Pressable>
              </View>

              {type === 'missed_punch' ? (
                <>
                  <Text style={styles.hint}>{t('missedPunchHint')}</Text>

                  <Text style={styles.label}>{t('missedPunchWorkDate')}</Text>
                  <TextInput onChangeText={onWorkDateChange} style={styles.input} value={workDate} />

                  <Text style={styles.label}>{t('missedPunchShift')}</Text>
                  {daySlots.length === 0 ? (
                    <Text style={styles.warn}>{t('missedPunchNoShifts')}</Text>
                  ) : (
                    <View style={styles.slotList}>
                      {daySlots.map((slot, idx) => {
                        const on = idx === slotIndex;
                        return (
                          <Pressable
                            key={`${workDate}-${idx}`}
                            onPress={() => {
                              setSlotIndex(idx);
                              const startPart = slot.range.split(/[–-]/)[0]?.trim() ?? proposedTime;
                              setProposedTime(startPart);
                            }}
                            style={[styles.slotCard, on && styles.slotCardOn]}
                          >
                            <Text style={[styles.slotCardTitle, on && styles.slotCardTitleOn]}>
                              {t(slot.region)} · {t(slot.shiftKey)}
                            </Text>
                            <Text style={[styles.slotCardTime, on && styles.slotCardTimeOn]}>{slot.range}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <Text style={styles.label}>{t('missedPunchKind')}</Text>
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => setPunchKind('in')}
                      style={[styles.chip, punchKind === 'in' && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, punchKind === 'in' && styles.chipTextOn]}>{t('clockIn')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPunchKind('out')}
                      style={[styles.chip, punchKind === 'out' && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, punchKind === 'out' && styles.chipTextOn]}>{t('clockOut')}</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.label}>{t('missedPunchProposedTime')}</Text>
                  <TextInput
                    onChangeText={setProposedTime}
                    placeholder="08:30"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={proposedTime}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>{t('start')}</Text>
                  <TextInput onChangeText={setStart} style={styles.input} value={start} />

                  <Text style={styles.label}>{t('end')}</Text>
                  <TextInput onChangeText={setEnd} style={styles.input} value={end} />
                </>
              )}

              <Text style={styles.label}>{t('reason')}</Text>
              <TextInput
                multiline
                onChangeText={setReason}
                placeholder="…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={reason}
              />

              <View style={styles.sheetActions}>
                <Pressable onPress={() => setOpen(false)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryText}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={onCreate}
                  disabled={type === 'missed_punch' && daySlots.length === 0}
                  style={[
                    styles.primaryBtn,
                    type === 'missed_punch' && daySlots.length === 0 && styles.primaryBtnDisabled,
                  ]}
                >
                  <Text style={styles.primaryText}>{t('submit')}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, flex: 1 },
  primarySm: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primarySmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { padding: 20, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
  reason: { marginTop: 8, color: colors.text, fontSize: 14, lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  sheetScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  hint: { marginTop: 10, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  warn: { marginTop: 8, fontSize: 13, color: colors.warning, fontWeight: '600' },
  label: { marginTop: 10, fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFD',
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textMuted, fontWeight: '700' },
  chipTextOn: { color: colors.primaryDark },
  slotList: { marginTop: 8, gap: 8 },
  slotCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFD',
  },
  slotCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  slotCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  slotCardTitleOn: { color: colors.primaryDark },
  slotCardTime: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.textMuted },
  slotCardTimeOn: { color: colors.primaryDark },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFBFD',
  },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryText: { fontWeight: '800', color: colors.text },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { fontWeight: '800', color: '#fff' },
});
