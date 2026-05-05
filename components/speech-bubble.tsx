import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Mascot, type MascotPose } from '@/components/mascot';
import { colors, fonts, radius, shadowSm } from '@/lib/theme';

// Standalone speech bubble. Tail points to the left side by default (mascot
// sits to the left). Used inside MascotWithSpeech for the standard layout.
export function SpeechBubble({
  text,
  style,
  tail = 'left',
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  tail?: 'left' | 'none';
}) {
  return (
    <View style={[styles.bubble, style]}>
      {tail === 'left' && <View style={styles.tail} />}
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

// Mascot + speech bubble side-by-side. Use this for the inline encouragement
// pattern: small mascot on the left, bubble on the right.
export function MascotWithSpeech({
  pose,
  text,
  size = 'md',
  containerStyle,
}: {
  pose: MascotPose;
  text: string;
  size?: 'sm' | 'md' | 'lg';
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, containerStyle]}>
      <Mascot pose={pose} size={size} />
      <SpeechBubble text={text} style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
    ...shadowSm,
  },
  // Triangular tail pointing left (toward the mascot). Implemented as a
  // rotated square peeking out from behind the bubble, with a matching
  // border on the visible side. Cheap and crisp on any background.
  tail: {
    position: 'absolute',
    left: -6,
    top: '50%',
    marginTop: -6,
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderSubtle,
    transform: [{ rotate: '45deg' }],
  },
  text: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: fonts.medium,
    letterSpacing: -0.1,
  },
});
