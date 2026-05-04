import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useRef, useState } from 'react';
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

import { useAuth, type SignUpRole } from '@/lib/auth-context';
import { FontAwesome } from '@expo/vector-icons';
import { colors, radius, shadowSm, space } from '@/lib/theme';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogleIdToken, setGoogleAccessToken } = useAuth();

  // Native Google sign-in via the iOS OAuth client — no redirect URL involved.
  // Calendar + Classroom scopes are requested upfront so the access token can
  // hit both APIs without a second consent prompt. Adding new scopes triggers
  // Google's incremental consent on the next sign-in for existing users.
  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: [
      'email',
      'profile',
      'openid',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
      'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
    ],
  });

  // Latest role/code at the moment Google returns — refs survive across the
  // async OAuth round trip without becoming stale closures.
  const roleRef = useRef<SignUpRole>('parent');
  const familyCodeRef = useRef('');
  const modeRef = useRef<'signin' | 'signup'>('signin');

  const [mode, setMode] = useState<Mode>('signin');
  const [role, setRole] = useState<SignUpRole>('parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordOk = password.length >= 6;
  const familyCodeOk = mode === 'signin' || role === 'parent' || familyCode.trim().length >= 4;
  const valid = emailOk && passwordOk && familyCodeOk;

  const submit = async () => {
    if (!valid || submitting) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const result = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, { role, familyCode: familyCode.trim() });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'signup' && (result as { needsConfirm?: boolean }).needsConfirm) {
      setInfo('Check your email to confirm your account, then sign in.');
      setMode('signin');
      setPassword('');
      return;
    }
    if (mode === 'signup' && role === 'parent' && (result as { familyCode?: string }).familyCode) {
      // Family code surfaces in Settings → Family card; no modal needed
      setInfo(`Account ready. Your family code is ${(result as { familyCode?: string }).familyCode}.`);
    }
  };

  const continueWithGoogle = async () => {
    if (googleSubmitting || !googleRequest) return;
    setError(null);
    setInfo(null);
    // Snapshot form state so it survives the async OAuth round trip
    roleRef.current = role;
    familyCodeRef.current = familyCode.trim();
    modeRef.current = mode;
    setGoogleSubmitting(true);
    await promptGoogle();
    // The actual sign-in completes in the useEffect below when googleResponse fires
  };

  // When Google returns with an id_token, exchange it for a Supabase session
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setGoogleSubmitting(false);
      if (googleResponse.type === 'error') {
        setError(googleResponse.error?.message ?? 'Google sign-in failed');
      }
      return;
    }
    const idToken = googleResponse.authentication?.idToken;
    const accessToken = googleResponse.authentication?.accessToken ?? null;
    if (!idToken) {
      setGoogleSubmitting(false);
      setError('Google did not return an ID token');
      return;
    }
    (async () => {
      const result = await signInWithGoogleIdToken(idToken, {
        role: modeRef.current === 'signup' ? roleRef.current : undefined,
        familyCode:
          modeRef.current === 'signup' && roleRef.current === 'student'
            ? familyCodeRef.current
            : undefined,
      });
      setGoogleSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Persist Google access token after Supabase exchange succeeds — it
      // unlocks Calendar + Classroom API calls in the rest of the app.
      if (accessToken) await setGoogleAccessToken(accessToken);
      if (result.needsRoleSetup) {
        setInfo(
          "Signed in with Google. Switch to 'Create one' below and pick Parent or Student to finish setup.",
        );
      }
    })();
  }, [googleResponse, signInWithGoogleIdToken, setGoogleAccessToken]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <View style={styles.logoMark}>
            <Text style={styles.logoChar}>F</Text>
          </View>
          <Text style={styles.brand}>FocusFlow</Text>
          <Text style={styles.tagline}>Less scroll. More learn.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
          <Text style={styles.subtitle}>
            {mode === 'signin'
              ? 'Welcome back. Sync your settings across devices.'
              : role === 'parent'
                ? "Set up rules and share a family code with your child."
                : "Enter your parent's family code to apply their rules to this device."}
          </Text>

          {mode === 'signup' && (
            <>
              <Text style={styles.label}>I am a</Text>
              <View style={styles.roleRow}>
                <Pressable
                  onPress={() => setRole('parent')}
                  style={({ pressed }) => [
                    styles.roleBtn,
                    role === 'parent' && styles.roleBtnActive,
                    pressed && { opacity: 0.9 },
                  ]}>
                  <Text style={[styles.roleBtnText, role === 'parent' && styles.roleBtnTextActive]}>Parent</Text>
                </Pressable>
                <Pressable
                  onPress={() => setRole('student')}
                  style={({ pressed }) => [
                    styles.roleBtn,
                    role === 'student' && styles.roleBtnActive,
                    pressed && { opacity: 0.9 },
                  ]}>
                  <Text style={[styles.roleBtnText, role === 'student' && styles.roleBtnTextActive]}>Student</Text>
                </Pressable>
              </View>
            </>
          )}

          {mode === 'signup' && role === 'student' && (
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
                style={[styles.input, { letterSpacing: 2, fontWeight: '700' }]}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Pressable onPress={() => setReveal((v) => !v)} style={styles.iconBtn}>
              <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {info && <Text style={styles.infoText}>{info}</Text>}

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
              : <Text style={styles.btnText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>}
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <Pressable
            onPress={continueWithGoogle}
            disabled={googleSubmitting || !googleRequest}
            style={({ pressed }) => [
              styles.googleBtn,
              (googleSubmitting || !googleRequest) && { opacity: 0.7 },
              pressed && { opacity: 0.85 },
            ]}>
            {googleSubmitting
              ? <ActivityIndicator color={colors.textPrimary} />
              : (
                <>
                  <FontAwesome name="google" size={16} color={colors.textPrimary} style={{ marginRight: 8 }} />
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setInfo(null);
            }}
            style={styles.switch}>
            <Text style={styles.switchText}>
              {mode === 'signin'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={styles.switchLink}>{mode === 'signin' ? 'Create one' : 'Sign in'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 32 },

  brandWrap: { alignItems: 'center', gap: 8 },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowSm,
    marginBottom: 4,
  },
  logoChar: { color: colors.textInverse, fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  brand: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  tagline: { color: colors.textSecondary, fontSize: 13 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 22 },

  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: space.md,
  },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 0 },
  iconBtn: {
    width: 42,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },

  btn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: colors.neutral },
  btnText: { color: colors.textInverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

  switch: { marginTop: 14, alignItems: 'center' },
  switchText: { color: colors.textSecondary, fontSize: 13 },
  switchLink: { color: colors.accent, fontWeight: '700' },

  errorText: { color: colors.danger, fontSize: 12, marginTop: 4, marginBottom: 4 },
  infoText: { color: colors.accent, fontSize: 12, marginTop: 4, marginBottom: 4 },

  roleRow: { flexDirection: 'row', gap: 8, marginBottom: space.md },
  roleBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  roleBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  roleBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  roleBtnTextActive: { color: colors.accent },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  orText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  googleBtnText: { color: colors.textPrimary, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
});
