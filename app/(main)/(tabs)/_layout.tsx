import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../../src/theme/colors';

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // iPhone 底部横条（Home Indicator）占用 safe area；额外留 6pt 给文字与横条之间的空隙
  const tabBarBottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 12) + 6 : Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: tabBarBottomPad,
          // 不设死高度，让图标+标签在 safe area 之上排开；Android 无横条时仍保持紧凑
          minHeight: 52 + tabBarBottomPad,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabSchedule'),
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="calendar-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('tabRequests'),
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="document-text-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="clock"
        options={{
          title: t('tabClock'),
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="time-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabProfile'),
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="person-circle-outline" size={size} />,
        }}
      />
    </Tabs>
  );
}
