import { Platform, StatusBar } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Stack 原生标题栏顶部留白（小米等机型 insets.top 可能为 0） */
export function getStackTopInset(insets: EdgeInsets): number {
  if (Platform.OS === 'android') {
    return Math.max(insets.top, StatusBar.currentHeight ?? 24);
  }
  return insets.top;
}
