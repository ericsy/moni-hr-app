import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type PunchDeviceType = 'ios' | 'android';

export function getPunchDeviceId(): string {
  const raw =
    (Constants.installationId as string | undefined) ??
    (Constants.sessionId as string | undefined) ??
    `moni-${Platform.OS}-${Date.now()}`;
  return String(raw).slice(0, 256);
}

/** 与 AppClockPunchRequest.deviceType / deviceId 一致 */
export function getPunchDevicePayload(): { deviceType: PunchDeviceType; deviceId: string } {
  const deviceType: PunchDeviceType = Platform.OS === 'ios' ? 'ios' : 'android';
  const deviceId = getPunchDeviceId();
  return { deviceType, deviceId };
}
