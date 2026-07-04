import { InteractionManager } from 'react-native';
import { router } from 'expo-router';

import type { TimelineFieldJobItem } from '../types/fieldService';
import { fieldJobWorkDate } from './fieldMissedPunchEligibility';
import { normalizeDateKeyOrToday } from './calendarDateKey';

function sanitizeRouteParam(value?: string | null): string {
  const raw = (value ?? '').trim();
  return raw.replace(/[^\x20-\x7E]/g, '-').slice(0, 120);
}

export function openFieldMissedPunchRequest(params: {
  job: TimelineFieldJobItem;
  punchKind: 'in' | 'out';
  workDate?: string;
}) {
  const workDate = normalizeDateKeyOrToday(params.workDate ?? fieldJobWorkDate(params.job));
  InteractionManager.runAfterInteractions(() => {
    router.push({
      pathname: '/request-create',
      params: {
        type: 'missed_punch',
        source: 'field',
        fieldJobId: sanitizeRouteParam(params.job.id),
        workDate,
        punchKind: params.punchKind === 'out' ? 'out' : 'in',
        customerName: sanitizeRouteParam(params.job.customerName),
        jobStart: sanitizeRouteParam(params.job.start),
        jobEnd: sanitizeRouteParam(params.job.end),
        serviceAddress: sanitizeRouteParam(params.job.serviceAddress),
        syncStoreClockIn: params.job.syncStoreClockIn ? '1' : '0',
        syncStoreClockOut: params.job.syncStoreClockOut ? '1' : '0',
      },
    });
  });
}

export function openFieldLeaveRequest(params: { job: TimelineFieldJobItem; workDate?: string }) {
  const workDate = normalizeDateKeyOrToday(params.workDate ?? fieldJobWorkDate(params.job));
  InteractionManager.runAfterInteractions(() => {
    router.push({
      pathname: '/request-create',
      params: {
        type: 'leave',
        source: 'field',
        fieldJobId: sanitizeRouteParam(params.job.id),
        workDate,
        customerName: sanitizeRouteParam(params.job.customerName),
        jobStart: sanitizeRouteParam(params.job.start),
        jobEnd: sanitizeRouteParam(params.job.end),
        serviceAddress: sanitizeRouteParam(params.job.serviceAddress),
        syncStoreClockIn: params.job.syncStoreClockIn ? '1' : '0',
        syncStoreClockOut: params.job.syncStoreClockOut ? '1' : '0',
      },
    });
  });
}
