import 'react-native-gesture-handler';

import '../src/i18n';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { AppProviders } from '../src/providers/AppProviders';
import { DutyPushBootstrap } from '../src/providers/DutyPushBootstrap';
import { colors } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <AppProviders>
      <DutyPushBootstrap />
      <StatusBar
        style="dark"
        translucent={Platform.OS === 'android' ? false : undefined}
        backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </AppProviders>
  );
}
