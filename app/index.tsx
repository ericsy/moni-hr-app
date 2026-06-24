import { Redirect, useRootNavigationState } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/colors';

export default function Index() {
  const { ready, session } = useAuth();
  const navState = useRootNavigationState();

  if (!ready || !navState?.key) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!session.user.activated) {
    return <Redirect href="/activate" />;
  }

  return <Redirect href="/today" />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
