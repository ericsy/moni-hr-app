import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

import type { AppAttendanceFieldImpact } from '../api/types';
import { formatFieldImpactAlertLine } from './formatFieldImpact';

export function requiredFieldImpacts(impacts: AppAttendanceFieldImpact[] | undefined): AppAttendanceFieldImpact[] {
  return (impacts ?? []).filter((row) => row.requiredAction === 'required');
}

/** 预览/展示：仅保留与请假时段有实际重叠的外勤 */
export function visibleFieldImpacts(
  impacts: AppAttendanceFieldImpact[] | undefined,
): AppAttendanceFieldImpact[] {
  return (impacts ?? []).filter((row) => {
    const overlap = (row.overlapType ?? '').trim().toLowerCase();
    return overlap === 'full' || overlap === 'partial';
  });
}

export function sameFieldImpactPreview(
  a: AppAttendanceFieldImpact[],
  b: AppAttendanceFieldImpact[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (
      x.fieldJobId !== y.fieldJobId ||
      (x.overlapType ?? '') !== (y.overlapType ?? '') ||
      (x.requiredAction ?? '') !== (y.requiredAction ?? '') ||
      (x.customerName ?? '') !== (y.customerName ?? '') ||
      (x.scheduledStart ?? '') !== (y.scheduledStart ?? '') ||
      (x.scheduledEnd ?? '') !== (y.scheduledEnd ?? '')
    ) {
      return false;
    }
  }
  return true;
}

export function formatFieldImpactLines(
  impacts: AppAttendanceFieldImpact[],
  t: TFunction,
  language: string,
): string {
  return impacts.map((row) => formatFieldImpactAlertLine(row, t, language)).join('\n\n');
}

export function confirmRequiredFieldImpacts(
  impacts: AppAttendanceFieldImpact[],
  t: TFunction,
  language: string,
): Promise<number[] | null> {
  const required = requiredFieldImpacts(impacts);
  if (required.length === 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    Alert.alert(
      t('leaveFieldImpactTitle'),
      t('leaveFieldImpactMessage', { list: formatFieldImpactLines(required, t, language) }),
      [
        { text: t('cancel'), style: 'cancel', onPress: () => resolve(null) },
        {
          text: t('leaveFieldImpactConfirm'),
          onPress: () => resolve(required.map((r) => r.fieldJobId)),
        },
      ],
    );
  });
}
