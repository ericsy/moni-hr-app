import * as Location from 'expo-location';

import i18n from '../i18n';

export type LocationPermissionResult =
  | { granted: true }
  | { granted: false; message: string };

/** 打卡前申请定位权限（直接调系统授权框，用途说明见原生 locales 配置） */
export async function ensureLocationPermissionForPunch(): Promise<LocationPermissionResult> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true };
  }
  if (current.status === 'denied' && current.canAskAgain === false) {
    return { granted: false, message: i18n.t('clockPermissionDenied') };
  }

  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status === 'granted') {
    return { granted: true };
  }
  return { granted: false, message: i18n.t('clockPermissionDenied') };
}
