import { Linking } from 'react-native';

export function normalizePhoneForDial(phone: string): string {
  return phone.trim().replace(/[^\d+]/g, '');
}

export function canOpenPhoneDial(phone: string): boolean {
  return normalizePhoneForDial(phone).length > 0;
}

/** 调起系统拨号盘 */
export async function openPhoneDial(phone: string): Promise<boolean> {
  const normalized = normalizePhoneForDial(phone);
  if (!normalized) return false;

  const url = `tel:${normalized}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
