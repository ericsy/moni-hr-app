import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

import type { AppAttendanceDutyImpact } from '../api/types';
import type { AppAttendanceFieldImpact } from '../api/types';

export function dutyImpactKey(impact: AppAttendanceDutyImpact): string {
  if (impact.impactKey?.trim()) return impact.impactKey.trim();
  return `${impact.templateId}:${impact.workDate ?? ''}:${impact.publishedCellId ?? 0}`;
}

export function requiredDutyImpacts(
  impacts: AppAttendanceDutyImpact[] | undefined,
): AppAttendanceDutyImpact[] {
  return (impacts ?? []).filter((row) => row.requiredAction === 'required');
}

export function visibleDutyImpacts(
  impacts: AppAttendanceDutyImpact[] | undefined,
): AppAttendanceDutyImpact[] {
  return (impacts ?? []).filter((row) => {
    const overlap = (row.overlapType ?? '').trim().toLowerCase();
    return overlap === 'full' || overlap === 'partial';
  });
}

/** 与外勤同店班格子关联的 Duty（可继承外勤处置，无需再选执行人） */
export function findParentFieldImpactForDuty(
  duty: AppAttendanceDutyImpact,
  fieldImpacts: AppAttendanceFieldImpact[] | undefined,
): AppAttendanceFieldImpact | null {
  const list = fieldImpacts ?? [];
  if (list.length === 0) return null;
  const cellId = duty.publishedCellId;
  if (cellId != null && Number(cellId) > 0) {
    const matches = list.filter(
      (f) => f.linkedStoreShiftId != null && Number(f.linkedStoreShiftId) === Number(cellId),
    );
    if (matches.length > 0) {
      return matches.find((m) => m.requiredAction === 'required') ?? matches[0] ?? null;
    }
  }
  // 外勤请假兜底：仅一条外勤影响
  if (list.length === 1) return list[0] ?? null;
  return null;
}

export type InheritedDutyDisposition = {
  action: 'skip' | 'reassign';
  assigneeMerchantAdminId?: string;
};

/** 外勤 cancel → Duty skip；外勤 reassign → Duty 同人改派 */
export function inheritDutyFromFieldAction(
  fieldAction: 'cancel' | 'reassign' | '' | undefined,
  fieldAssigneeId: string | undefined,
): InheritedDutyDisposition | null {
  if (fieldAction === 'cancel') return { action: 'skip' };
  if (fieldAction === 'reassign') {
    const id = (fieldAssigneeId ?? '').trim();
    if (!id) return null;
    return { action: 'reassign', assigneeMerchantAdminId: id };
  }
  return null;
}

export function sameDutyImpactPreview(
  a: AppAttendanceDutyImpact[],
  b: AppAttendanceDutyImpact[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (
      dutyImpactKey(x) !== dutyImpactKey(y) ||
      (x.overlapType ?? '') !== (y.overlapType ?? '') ||
      (x.requiredAction ?? '') !== (y.requiredAction ?? '') ||
      (x.title ?? '') !== (y.title ?? '')
    ) {
      return false;
    }
  }
  return true;
}

function triggerLabel(trigger: string | undefined, t: TFunction): string {
  if (trigger === 'clock_in') return t('dutyTriggerClockIn');
  if (trigger === 'clock_out') return t('dutyTriggerClockOut');
  if (trigger === 'recurring') return t('dutyTriggerRecurring');
  return trigger ?? '';
}

export function formatDutyImpactLines(impacts: AppAttendanceDutyImpact[], t: TFunction): string {
  return impacts
    .map((row) => {
      const title = (row.title ?? '').trim() || t('dutyImpactUntitled');
      const type = triggerLabel(row.triggerType, t);
      const date = row.workDate ?? '';
      return `${title}${type ? ` (${type})` : ''}${date ? ` · ${date}` : ''}`;
    })
    .join('\n\n');
}

export function confirmRequiredDutyImpacts(
  impacts: AppAttendanceDutyImpact[],
  t: TFunction,
): Promise<string[] | null> {
  const required = requiredDutyImpacts(impacts);
  if (required.length === 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    Alert.alert(
      t('leaveDutyImpactTitle'),
      t('leaveDutyImpactMessage', { list: formatDutyImpactLines(required, t) }),
      [
        { text: t('cancel'), style: 'cancel', onPress: () => resolve(null) },
        {
          text: t('leaveDutyImpactConfirm'),
          onPress: () => resolve(required.map((r) => dutyImpactKey(r))),
        },
      ],
    );
  });
}
