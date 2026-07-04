import { getAppClientVersion } from './appClientMeta';

/** 与后端 AppClientCapability 一致 */
export const LEAVE_FIELD_LINKAGE_MIN_VERSION = '1.1.0';
export const LEAVE_FIELD_V2_MIN_VERSION = '1.2.0';

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((part) => {
      const n = Number.parseInt(part.replace(/[^0-9].*$/, ''), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** 当前 App 是否支持班次请假与外勤联动（提交确认 + 审批处置） */
export function supportsLeaveFieldV1(): boolean {
  const current = parseVersionParts(getAppClientVersion());
  const min = parseVersionParts(LEAVE_FIELD_LINKAGE_MIN_VERSION);
  const len = Math.max(current.length, min.length);
  for (let i = 0; i < len; i += 1) {
    const a = current[i] ?? 0;
    const b = min[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

/** P2 date_range + P3 独立外勤请假 */
export function supportsLeaveFieldV2(): boolean {
  const current = parseVersionParts(getAppClientVersion());
  const min = parseVersionParts(LEAVE_FIELD_V2_MIN_VERSION);
  const len = Math.max(current.length, min.length);
  for (let i = 0; i < len; i += 1) {
    const a = current[i] ?? 0;
    const b = min[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}
