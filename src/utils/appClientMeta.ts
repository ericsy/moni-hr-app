import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AppClientPlatform = 'ios' | 'android';

/** 用户可见 App 版本号 */
export function getAppClientVersion(): string {
  return (
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '0.0.0'
  );
}

export function getAppClientPlatform(): AppClientPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** 所有 App API 请求统一携带，便于服务端统计版本分布 */
export function getAppClientHeaders(): Record<string, string> {
  return {
    'X-App-Version': getAppClientVersion(),
    'X-App-Platform': getAppClientPlatform(),
  };
}
