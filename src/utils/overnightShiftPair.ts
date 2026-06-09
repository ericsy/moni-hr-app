import { parseShiftRange } from './shiftClockWindow';

export type OvernightRole = 'start' | 'end' | 'normal';

const END_SEGMENT_END_MIN = 23 * 60 + 59;
const START_SEGMENT_START_MIN = 0;

export type OvernightSlotLike = {
  id: string;
  areaName: string;
  range: string;
};

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = `${dt.getMonth() + 1}`.padStart(2, '0');
  const dd = `${dt.getDate()}`.padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function isOvernightSegmentEnd(range: string): boolean {
  const parsed = parseShiftRange(range);
  return parsed?.endMin === END_SEGMENT_END_MIN;
}

export function isOvernightSegmentStart(range: string): boolean {
  const parsed = parseShiftRange(range);
  return parsed?.startMin === START_SEGMENT_START_MIN;
}

/** 在按日分组后的排班表上标注跨天夜班配对 */
export function annotateOvernightPairs(
  byDate: Record<string, OvernightSlotLike[]>,
): Record<
  string,
  (OvernightSlotLike & {
    overnightRole?: OvernightRole;
    overnightPairCellId?: string;
    overnightDisplayRange?: string;
  })[]
> {
  const out: Record<
    string,
    (OvernightSlotLike & {
      overnightRole?: OvernightRole;
      overnightPairCellId?: string;
      overnightDisplayRange?: string;
    })[]
  > = {};
  for (const [date, slots] of Object.entries(byDate)) {
    out[date] = slots.map((s) => ({ ...s }));
  }

  for (const date of Object.keys(out).sort()) {
    for (const slot of out[date]) {
      if (isOvernightSegmentEnd(slot.range)) {
        const nextDate = addDaysIso(date, 1);
        const partner = (out[nextDate] ?? []).find(
          (s) =>
            s.areaName === slot.areaName &&
            isOvernightSegmentStart(s.range) &&
            s.id !== slot.id,
        );
        if (partner) {
          slot.overnightRole = 'start';
          slot.overnightPairCellId = partner.id;
          const startHm = slot.range.split(/[–-]/)[0]?.trim() ?? '';
          const endHm = partner.range.split(/[–-]/)[1]?.trim() ?? '';
          if (startHm && endHm) slot.overnightDisplayRange = `${startHm}–${endHm}`;
        }
      }
    }
    for (const slot of out[date]) {
      if (isOvernightSegmentStart(slot.range)) {
        const prevDate = addDaysIso(date, -1);
        const partner = (out[prevDate] ?? []).find(
          (s) =>
            s.areaName === slot.areaName &&
            isOvernightSegmentEnd(s.range) &&
            s.id !== slot.id,
        );
        if (partner) {
          slot.overnightRole = 'end';
          slot.overnightPairCellId = partner.id;
          const startHm = partner.range.split(/[–-]/)[0]?.trim() ?? '';
          const endHm = slot.range.split(/[–-]/)[1]?.trim() ?? '';
          if (startHm && endHm) slot.overnightDisplayRange = `${startHm}–${endHm}`;
        }
      }
    }
  }
  return out;
}
