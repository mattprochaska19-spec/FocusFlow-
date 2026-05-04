import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FamilyDashboard } from '@/components/family-dashboard';
import { useFocus } from '@/lib/focus-context';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useFocus();

  // Tab is hidden from students at the layout level, but render-guard anyway
  // in case it's reached via deep link.
  if (profile?.role !== 'parent') return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}>
      <Text style={styles.pageTitle}>Family</Text>
      <Text style={styles.pageSub}>
        See what each child is doing and approve their work as it comes in.
      </Text>

      <View style={styles.codeCard}>
        <View style={styles.codeHeader}>
          <View style={styles.codeIcon}>
            <Ionicons name="key-outline" size={14} color={colors.accent} />
          </View>
          <Text style={styles.codeLabel}>Family Code</Text>
        </View>
        <Text style={styles.codeValue} selectable>
          {profile.familyCode ?? '— —'}
        </Text>
        <Text style={styles.codeHint}>
          Tap and hold to copy. Share with your child during sign-up to link their device.
        </Text>
      </View>

      <FamilyDashboard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24 },

  pageTitle: {
    fontSize: 32,
    fontFamily: fonts.serifBold,
    color: colors.textPrimary,
    letterSpacing: -1,
    marginBottom: 4,
  },
  pageSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 24 },

  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  codeIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  codeValue: {
    color: colors.textPrimary,
    fontSize: 32,
    fontFamily: fonts.serifBlack,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    paddingVertical: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    marginBottom: 10,
  },
  codeHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
