import { Linking } from 'react-native';

export function normalizePhoneForDial(phone: string): string {
  return phone.trim().replace(/[^\d+]/g, '');
}

export function canOpenPhoneDial(phone: string): boolean {
  return normalizePhoneForDial(phone).length > 0;
}

/** 调起系统拨号盘（tel: 不依赖 canOpenURL，iOS 未声明 scheme 时 canOpenURL 会误报 false） */
export async function openPhoneDial(phone: string): Promise<boolean> {
  const normalized = normalizePhoneForDial(phone);
  if (!normalized) return false;

  const url = `tel:${normalized}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
