import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FamilyDashboard } from '@/components/family-dashboard';
import { useFocus } from '@/lib/focus-context';
import { colors, fonts, space } from '@/lib/theme';

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
        Per-child rules, schedules, and quests. Family code lives in Settings.
      </Text>

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
});
