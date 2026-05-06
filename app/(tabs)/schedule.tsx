import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssignmentsSection } from '@/components/assignments-section';
import { FocusSessionCard } from '@/components/focus-session-card';
import { colors, fonts, space } from '@/lib/theme';

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}>
      <Text style={styles.pageTitle}>Schedule</Text>
      <Text style={styles.pageSub}>Your assignments and focus sessions.</Text>

      <FocusSessionCard />
      <AssignmentsSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24 },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  pageSub: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: 24,
  },
});
