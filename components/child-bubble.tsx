import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadowSm } from '@/lib/theme';

// Netflix-style profile bubble used to pick a child in the Family and
// Activity tabs. The "ring" is the selection indicator; an optional dot
// marks an active remote focus session. Initial = first letter of the
// child's display name.
export function ChildBubble({
  displayName,
  selected,
  hasActiveFocus = false,
  onPress,
}: {
  displayName: string;
  selected: boolean;
  hasActiveFocus?: boolean;
  onPress: () => void;
}) {
  const initial = (displayName || '?').charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.96 }] }]}>
      <View style={[styles.ring, selected && styles.ringSelected]}>
        <View style={styles.bubble}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
        {hasActiveFocus && <View style={styles.statusDot} />}
      </View>
      <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginRight: 14, width: 64 },
  ring: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: { borderColor: colors.accent },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowSm,
  },
  initial: { color: colors.accent, fontSize: 22, fontFamily: fonts.serifBold, letterSpacing: -0.5 },
  statusDot: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  name: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 64,
  },
  nameSelected: { color: colors.textPrimary },
});
