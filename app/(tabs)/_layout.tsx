import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';

import { useFocus } from '@/lib/focus-context';
import { colors, fonts } from '@/lib/theme';

export default function TabLayout() {
  const { profile } = useFocus();
  const isStudent = profile?.role === 'student';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: fonts.bold,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync();
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
        name="family"
        options={{
          title: 'Family',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size - 2} color={color} />,
          // Parents only — students don't have linked children to view.
          href: isStudent ? null : '/family',
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
