import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';
import { getStackTopInset } from '../../src/utils/stackSafeArea';

export default function MainLayout() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const headerStatusBarHeight = getStackTopInset(insets);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setTranslucent(false);
    RNStatusBar.setBackgroundColor(colors.surface);
  }, []);

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!session.user.activated) {
    return <Redirect href="/activate" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStatusBarHeight,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="requests" options={{ headerShown: true }} />
      <Stack.Screen name="request-create" options={{ headerShown: true }} />
      <Stack.Screen name="date-leave-create" options={{ headerShown: true }} />
      <Stack.Screen name="request-detail" options={{ headerShown: true }} />
      <Stack.Screen name="punch-records" options={{ headerShown: true }} />
      <Stack.Screen name="change-password" options={{ headerShown: true }} />
    </Stack>
  );
}
