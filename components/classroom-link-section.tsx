import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CLASSROOM_SCOPES, exchangeClassroomCode } from '@/lib/classroom-auth';
import { useAuth } from '@/lib/auth-context';
import { colors, fonts, radius } from '@/lib/theme';

// Lets the iOS auth-session redirect resolve once the OAuth web view returns.
WebBrowser.maybeCompleteAuthSession();

// Settings section that lets a student link a separate Google account for
// Classroom access. The primary signed-in account stays untouched — Calendar
// and Supabase identity remain bound to it. Only Classroom calls switch to
// this secondary account when linked.
//
// Shown to students only (parents have nothing to do here). Hidden when no
// iOS Google client is configured (env var missing).
export function ClassroomLinkSection() {
  const { classroomAccountEmail, saveClassroomTokens, unlinkClassroomAccount } = useAuth();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  // Code flow + offline access is required to receive a refresh_token, so we
  // can keep the school account linked across days without re-prompting the
  // student every hour. prompt=consent forces Google to issue a fresh refresh
  // token even if the user previously consented.
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: clientId,
    scopes: CLASSROOM_SCOPES,
    responseType: 'code',
    shouldAutoExchangeCode: false,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  // Whenever the OAuth response lands, exchange the code for tokens. We do
  // this in an effect rather than chaining on promptAsync because the result
  // arrives via the response state.
  useEffect(() => {
    if (!response) return;
    if (response.type === 'cancel' || response.type === 'dismiss') {
      setLinking(false);
      return;
    }
    if (response.type === 'error') {
      setError(response.error?.message ?? 'Sign-in failed');
      setLinking(false);
      return;
    }
    if (response.type !== 'success') return;
    const code = response.params.code;
    const codeVerifier = request?.codeVerifier;
    const redirectUri = request?.redirectUri;
    if (!code || !codeVerifier || !redirectUri || !clientId) {
      setError('OAuth response missing code/verifier/redirectUri');
      setLinking(false);
      return;
    }
    (async () => {
      try {
        const tokens = await exchangeClassroomCode({
          code,
          codeVerifier,
          clientId,
          redirectUri,
        });
        await saveClassroomTokens(tokens);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Token exchange failed');
      } finally {
        setLinking(false);
      }
    })();
  }, [response]);

  if (!clientId) return null;

  const link = async () => {
    if (!request) return;
    setError(null);
    setLinking(true);
    await promptAsync();
  };

  const confirmUnlink = () => {
    Alert.alert(
      'Disconnect school account?',
      'Pandu will stop pulling Google Classroom data from this account. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setUnlinking(true);
            await unlinkClassroomAccount();
            setUnlinking(false);
          },
        },
      ],
    );
  };

  const linked = !!classroomAccountEmail;

  return (
    <View>
      <Text style={styles.lead}>
        Use a separate Google account for Google Classroom — handy if your school account is
        different from the one you signed in with.
      </Text>

      {linked ? (
        <View style={styles.linkedRow}>
          <View style={styles.linkedIconWrap}>
            <Ionicons name="school" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkedLabel}>Connected</Text>
            <Text style={styles.linkedEmail} numberOfLines={1}>{classroomAccountEmail}</Text>
          </View>
          <Pressable
            onPress={confirmUnlink}
            disabled={unlinking}
            style={({ pressed }) => [styles.unlinkBtn, pressed && { opacity: 0.85 }]}>
            {unlinking
              ? <ActivityIndicator size="small" color={colors.danger} />
              : <Text style={styles.unlinkText}>Disconnect</Text>}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={link}
          disabled={!request || linking}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}>
          {linking
            ? <ActivityIndicator color={colors.textInverse} />
            : (
              <>
                <Ionicons name="logo-google" size={14} color={colors.textInverse} />
                <Text style={styles.linkText}>Connect school account</Text>
              </>
            )}
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 14 },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  linkText: { color: colors.textInverse, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.3 },

  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
  },
  linkedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  linkedEmail: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
    marginTop: 2,
  },
  unlinkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  unlinkText: { color: colors.danger, fontSize: 12, fontFamily: fonts.bold },

  error: { color: colors.danger, fontSize: 12, marginTop: 10 },
});
