import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pressable card whose body shows/hides on tap. Animated via LayoutAnimation
// for a free, native-feeling expand on every platform. Used to group related
// settings (per-child limits, schedule, quests) under a single tappable
// header without nesting a full accordion library.
export function CollapsibleSection({
  icon,
  title,
  badge,
  children,
  defaultOpen = false,
  rightAccessory,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  badge?: string | number;
  children: ReactNode;
  defaultOpen?: boolean;
  rightAccessory?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync().catch(() => {});
    setOpen((v) => !v);
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.header, pressed && { opacity: 0.85 }]}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {badge !== undefined && badge !== null && badge !== '' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {rightAccessory}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bold, letterSpacing: -0.2 },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 4,
  },
  badgeText: { color: colors.textInverse, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.3 },
  body: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
  },
});
