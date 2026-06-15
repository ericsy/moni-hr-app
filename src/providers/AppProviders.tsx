import { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../context/AuthContext';
import { AppUpdateProvider } from './AppUpdateProvider';

/** 根级 Provider：认证必须包在最内层 Stack 之外，且不要与键盘库混在同一层导致上下文异常 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppUpdateProvider>
          <AuthProvider>{children}</AuthProvider>
        </AppUpdateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
