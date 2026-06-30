import { Linking, Platform } from 'react-native';

type Params = {
  latitude?: number;
  longitude?: number;
  address?: string;
};

function hasValidCoords(lat?: number, lng?: number): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(lat === 0 && lng === 0);
}

function buildGoogleMapsDirectionsUrl(params: Params): string | null {
  const { latitude, longitude, address } = params;
  if (hasValidCoords(latitude, longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  const trimmed = address?.trim();
  if (!trimmed) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trimmed)}`;
}

/** 打开 Google 地图导航；优先经纬度，否则用地址文本 */
export async function openMapsNavigation(params: Params): Promise<boolean> {
  const url = buildGoogleMapsDirectionsUrl(params);
  if (!url) return false;

  if (Platform.OS === 'android' && hasValidCoords(params.latitude, params.longitude)) {
    const navUrl = `google.navigation:q=${params.latitude},${params.longitude}`;
    try {
      const canNav = await Linking.canOpenURL(navUrl);
      if (canNav) {
        await Linking.openURL(navUrl);
        return true;
      }
    } catch {
      // fall through to https
    }
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function canOpenMapsNavigation(params: Params): boolean {
  return buildGoogleMapsDirectionsUrl(params) != null;
}
