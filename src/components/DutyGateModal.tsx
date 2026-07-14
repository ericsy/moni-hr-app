import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { completeDutyAndRefreshSummary } from '../api/duties';
import { cancelDutyLocalNotification } from '../notifications/dutyPush';
import { colors } from '../theme/colors';
import type { DutyItem, TodayWorkSummary } from '../types/fieldService';

type Props = {
  visible: boolean;
  storeId: string;
  date: string;
  duties: DutyItem[];
  action?: string;
  onClose: () => void;
  onUpdated: (summary: TodayWorkSummary) => void;
};

export function DutyGateModal({
  visible,
  storeId,
  date,
  duties,
  action,
  onClose,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const title = useMemo(() => {
    if (action === 'DUTY_CLOCK_IN') return t('dutyModalTitleClockIn');
    if (action === 'DUTY_CLOCK_OUT') return t('dutyModalTitleClockOut');
    if (action === 'DUTY_RECURRING') return t('dutyModalTitleRecurring');
    return t('dutyModalTitlePending');
  }, [action, t]);

  const completeOne = async (duty: DutyItem) => {
    if (!duty.id || busyId) return;
    setBusyId(duty.id);
    try {
      const summary = await completeDutyAndRefreshSummary({
        storeId,
        instanceId: duty.id,
        date,
      });
      await cancelDutyLocalNotification(duty.id);
      onUpdated(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('complete duty failed', message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{t('dutyModalHint')}</Text>
          {duties.map((duty) => (
            <View key={duty.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dutyTitle}>{duty.title}</Text>
                {duty.description ? <Text style={styles.dutyDesc}>{duty.description}</Text> : null}
              </View>
              <Pressable
                style={[styles.btn, busyId === duty.id && styles.btnDisabled]}
                disabled={!!busyId}
                onPress={() => void completeOne(duty)}
              >
                {busyId === duty.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>{t('dutyModalDone')}</Text>
                )}
              </Pressable>
            </View>
          ))}
          {duties.length === 0 ? (
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>{t('dutyModalClose')}</Text>
            </Pressable>
          ) : null}
          {duties.length > 0 ? (
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>{t('dutyModalLater')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text || '#0f172a',
  },
  hint: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  dutyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  dutyDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 72,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  closeBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeText: {
    color: '#64748b',
    fontSize: 14,
  },
});
