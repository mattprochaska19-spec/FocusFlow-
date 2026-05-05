import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Mascot, type MascotPose } from '@/components/mascot';
import { colors, fonts, radius, shadow } from '@/lib/theme';

// Fullscreen overlay celebrating a moment with the mascot. Stays up until the
// user taps the dismiss button — we want them to actively acknowledge the
// achievement rather than have it disappear on its own.
export function Celebration({
  visible,
  pose,
  title,
  subtitle,
  buttonLabel = 'Got it',
  onDismiss,
}: {
  visible: boolean;
  pose: MascotPose;
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Mascot pose={pose} size="xl" />
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
            <Text style={styles.btnText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 26, 20, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 28,
    paddingVertical: 26,
    alignItems: 'center',
    gap: 8,
    minWidth: 260,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.medium,
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    marginTop: 14,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 180,
  },
  btnText: {
    color: colors.textInverse,
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
