import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { useAuth } from '@/lib/auth-context';
import { useFocus } from '@/lib/focus-context';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';

// Reached when a user has a Supabase session but no profile row — typically
// after a Google sign-in where role selection was skipped. The user must
// finish setup here before being routed into the app. The AuthGate forwards
// them here automatically; signing out also lives here so they can bail.
export default function SetupRoleScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { reloadProfile } = useFocus();

  const [role, setRole] = useState<'parent' | 'student' | null>(null);
  const [familyCode, setFamilyCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const familyCodeOk = role === 'parent' || familyCode.trim().length >= 4;
  const valid = role !== null && familyCodeOk;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    if (role === 'parent') {
      const { error: rpcErr } = await supabase.rpc('signup_as_parent');
      if (rpcErr) {
        setError(rpcErr.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { error: rpcErr } = await supabase.rpc('signup_as_student', { code: familyCode.trim() });
      if (rpcErr) {
        setError(rpcErr.message);
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    // Profile is now created on the server; pull it into focus-context so the
    // app re-renders into the appropriate per-role tabs.
    reloadProfile();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Mascot pose="happy" size="xl" />
          <Text style={styles.title}>One more step</Text>
          <Text style={styles.subtitle}>
            Tell us how you'll use Pandu so we can set up the right experience.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>I am a</Text>
          <View style={styles.roleRow}>
            <Pressable
              onPress={() => setRole('parent')}
              style={({ pressed }) => [
                styles.roleBtn,
                role === 'parent' && styles.roleBtnActive,
                pressed && { opacity: 0.9 },
              ]}>
              <Ionicons
                name={role === 'parent' ? 'shield-checkmark' : 'shield-outline'}
                size={18}
                color={role === 'parent' ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, role === 'parent' && styles.roleBtnTextActive]}>
                Parent
              </Text>
              <Text style={styles.roleBtnSub}>Manage rules + kids</Text>
            </Pressable>
            <Pressable
              onPress={() => setRole('student')}
              style={({ pressed }) => [
                styles.roleBtn,
                role === 'student' && styles.roleBtnActive,
                pressed && { opacity: 0.9 },
              ]}>
              <Ionicons
                name={role === 'student' ? 'school' : 'school-outline'}
                size={18}
                color={role === 'student' ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, role === 'student' && styles.roleBtnTextActive]}>
                Student
              </Text>
              <Text style={styles.roleBtnSub}>Use a family code</Text>
            </Pressable>
          </View>

          {role === 'student' && (
            <>
              <Text style={styles.label}>Family code</Text>
              <TextInput
                value={familyCode}
                onChangeText={(v) => setFamilyCode(v.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                style={[styles.input, styles.familyCodeInput]}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Text style={styles.hint}>
                Ask your parent for the 6-character code from their Settings tab.
              </Text>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={!valid || submitting}
            style={({ pressed }) => [
              styles.btn,
              (!valid || submitting) && styles.btnDisabled,
              pressed && { opacity: 0.9 },
            ]}>
            {submitting
              ? <ActivityIndicator color={colors.textInverse} />
              : <Text style={styles.btnText}>Finish setup</Text>}
          </Pressable>

          <Pressable onPress={signOut} hitSlop={8} style={styles.signOutLink}>
            <Text style={styles.signOutText}>Sign out and use a different account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  brandWrap: { alignItems: 'center', marginBottom: 32 },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.6,
    marginTop: 12,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 19,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },

  label: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontFamily: fonts.bold,
    marginTop: 6,
    marginBottom: 8,
  },

  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleBtn: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    gap: 6,
  },
  roleBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  roleBtnText: { color: colors.textSecondary, fontSize: 15, fontFamily: fonts.bold, letterSpacing: -0.2 },
  roleBtnTextActive: { color: colors.accent },
  roleBtnSub: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium },

  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  familyCodeInput: {
    fontSize: 18,
    fontFamily: fonts.bold,
    letterSpacing: 4,
    textAlign: 'center',
  },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 6, lineHeight: 15 },

  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  btnDisabled: { backgroundColor: colors.neutral },
  btnText: { color: colors.textInverse, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0.3 },

  error: { color: colors.danger, fontSize: 12, marginTop: 12 },

  signOutLink: { alignItems: 'center', marginTop: 14, padding: 6 },
  signOutText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
});
