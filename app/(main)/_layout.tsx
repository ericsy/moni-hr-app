import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';

export default function MainLayout() {
  const { session } = useAuth();

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
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="change-password" options={{ headerShown: true }} />
    </Stack>
  );
}
