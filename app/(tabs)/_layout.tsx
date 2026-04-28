import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useFocus } from '@/lib/focus-context';
import { colors } from '@/lib/theme';

export default function TabLayout() {
  const { profile } = useFocus();
  const isStudent = profile?.role === 'student';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: isStudent ? 'Account' : 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isStudent ? 'person-outline' : 'settings-outline'} size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
