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

import { Mascot } from '@/components/mascot';
import { useAuth, type SignUpRole } from '@/lib/auth-context';
import { exchangeAuthCode } from '@/lib/google-oauth';
import { FontAwesome } from '@expo/vector-icons';
import { colors, radius, shadowSm, space } from '@/lib/theme';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogleIdToken, setGoogleTokens } = useAuth();

  // Native Google sign-in via the iOS OAuth client. Code flow + offline access
  // (the only path that yields a refresh token), so the access token can be
  // silently renewed forever instead of forcing a re-sign-in every hour.
  // Adding new scopes triggers Google's incremental consent on next sign-in.
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
    responseType: 'code',
    shouldAutoExchangeCode: false,
    extraParams: {
      access_type: 'offline',
      // prompt=consent forces Google to re-issue a refresh token — without it,
      // returning users who already consented previously won't get one.
      prompt: 'consent',
    },
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

  // Code-flow Google sign-in: when Google returns with a code, exchange it
  // ourselves to get access + refresh + id tokens, then hand the id_token to
  // Supabase. Storing the refresh token unlocks transparent renewal so users
  // never see "Google session expired" again.
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setGoogleSubmitting(false);
      if (googleResponse.type === 'error') {
        setError(googleResponse.error?.message ?? 'Google sign-in failed');
      }
      return;
    }
    const code = googleResponse.params.code;
    const codeVerifier = googleRequest?.codeVerifier;
    const redirectUri = googleRequest?.redirectUri;
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!code || !codeVerifier || !redirectUri || !clientId) {
      setGoogleSubmitting(false);
      setError('Google did not return a code/verifier/redirectUri');
      return;
    }
    (async () => {
      try {
        const tokens = await exchangeAuthCode({ code, codeVerifier, clientId, redirectUri });
        if (!tokens.idToken) {
          setGoogleSubmitting(false);
          setError('Google did not return an ID token');
          return;
        }
        // Google sign-in always defers role + family-code selection to the
        // dedicated /(auth)/setup-role screen so the user can't accidentally
        // get the wrong role. The form's role/code fields here are only used
        // for the email/password signup flow.
        const result = await signInWithGoogleIdToken(tokens.idToken, {});
        setGoogleSubmitting(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        // Persist the full token bundle (access + refresh + expiry) so the
        // app can transparently renew tokens for the lifetime of the refresh
        // token (long-lived; effectively forever unless revoked).
        await setGoogleTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        });
        // result.needsRoleSetup → AuthGate forwards to /(auth)/setup-role
        // automatically. No info message needed; the screen change is the cue.
      } catch (e) {
        setGoogleSubmitting(false);
        setError(e instanceof Error ? e.message : 'Google token exchange failed');
      }
    })();
  }, [googleResponse, googleRequest, signInWithGoogleIdToken, setGoogleTokens]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Mascot pose="excited" size="xl" />
          <Text style={styles.brand}>Pandu</Text>
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
