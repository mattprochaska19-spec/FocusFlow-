import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  getValidClassroomAccessToken,
  loadClassroomTokens,
  persistClassroomTokens,
  revokeAndClearClassroomTokens,
  type ClassroomTokens,
} from './classroom-auth';
import { refreshGoogleAccessToken, revokeGoogleToken } from './google-oauth';
import { supabase } from './supabase';

export type SignUpRole = 'parent' | 'student';

// signInWithIdToken does not populate session.provider_token, so we capture the
// Google access token returned by expo-auth-session directly and persist it
// here. Both Calendar and Classroom API callers read it from this context.
const GOOGLE_ACCESS_TOKEN_KEY = 'google_access_token';
// New (2026-05): code-flow sign-in also captures a refresh token so we can
// auto-renew the access token instead of forcing the user to re-sign-in once
// per hour. Old sessions (pre-2026-05) won't have a refresh token; those
// users hit a single re-sign-in then upgrade to refresh-capable.
const GOOGLE_REFRESH_TOKEN_KEY = 'google_refresh_token';
const GOOGLE_TOKEN_EXPIRES_AT_KEY = 'google_token_expires_at';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  googleAccessToken: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    opts: { role: SignUpRole; familyCode?: string }
  ) => Promise<{ error?: string; needsConfirm?: boolean; familyCode?: string }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
  signInWithGoogleIdToken: (
    idToken: string,
    opts: { role?: SignUpRole; familyCode?: string }
  ) => Promise<{ error?: string; needsRoleSetup?: boolean }>;
  setGoogleAccessToken: (token: string | null) => Promise<void>;
  // Persist the full primary-token bundle (access + refresh + expiry) so the
  // app can auto-refresh forever instead of forcing a sign-in every hour.
  setGoogleTokens: (tokens: { accessToken: string; refreshToken: string | null; expiresAt: number }) => Promise<void>;
  // Returns a non-stale primary access token, refreshing transparently when
  // the stored token is within 30s of expiry. Returns null if no token is
  // stored OR the refresh fails (refresh token revoked/missing).
  getValidGoogleAccessToken: () => Promise<string | null>;
  // Secondary classroom-only Google account (for kids whose school account
  // differs from their personal sign-in account).
  classroomAccountEmail: string | null;
  // Persists the freshly-exchanged tokens after the OAuth flow finishes; the
  // OAuth flow itself runs inside a component (it needs the React hook).
  saveClassroomTokens: (tokens: ClassroomTokens) => Promise<void>;
  unlinkClassroomAccount: () => Promise<void>;
  // Resolver: returns the school token if linked, else falls back to the
  // primary signed-in Google token. Use this for any Classroom API call.
  getClassroomAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessTokenState] = useState<string | null>(null);
  const [classroomAccountEmail, setClassroomAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    AsyncStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY).then((tok) => {
      if (tok) setGoogleAccessTokenState(tok);
    });

    // Hydrate the secondary classroom email so Settings can show "Linked as ..."
    // immediately without waiting for an OAuth round-trip.
    loadClassroomTokens().then((t) => {
      if (t) setClassroomAccountEmail(t.email);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const setGoogleAccessToken = async (token: string | null) => {
    setGoogleAccessTokenState(token);
    if (token) await AsyncStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    else await AsyncStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  };

  const setGoogleTokens: AuthContextValue['setGoogleTokens'] = async (tokens) => {
    setGoogleAccessTokenState(tokens.accessToken);
    await AsyncStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      await AsyncStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
    await AsyncStorage.setItem(GOOGLE_TOKEN_EXPIRES_AT_KEY, String(tokens.expiresAt));
  };

  // Auto-refresh resolver. In-flight refreshes are dedup'd via a ref so two
  // simultaneous Calendar/Classroom calls don't both trigger a network round-trip.
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const getValidGoogleAccessToken = useCallback(async (): Promise<string | null> => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!clientId) return googleAccessToken; // misconfigured env — fall back

    const [storedAccess, storedRefresh, storedExpiresAt] = await Promise.all([
      AsyncStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY),
      AsyncStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY),
      AsyncStorage.getItem(GOOGLE_TOKEN_EXPIRES_AT_KEY),
    ]);

    // No stored access token at all → can't recover, caller decides what to do.
    if (!storedAccess) return null;

    // No expiry stored → legacy sign-in (pre-refresh-token era). Return what
    // we have; caller will hit 401 eventually and prompt re-sign-in.
    if (!storedExpiresAt) return storedAccess;

    const expiresAt = parseInt(storedExpiresAt, 10);
    if (expiresAt > Date.now() + 30_000) return storedAccess;

    // Stale. If we have a refresh token, swap for a fresh access token.
    if (!storedRefresh) return storedAccess; // no refresh available — caller will get 401

    // Dedup concurrent refresh attempts so multiple parallel Calendar/Classroom
    // fetches don't all hit Google's token endpoint at once.
    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        const refreshed = await refreshGoogleAccessToken({
          refreshToken: storedRefresh,
          clientId,
        });
        if (!refreshed) {
          // Refresh failed — most likely revoked. Clear stored bundle so the
          // user re-signs in cleanly next time.
          await AsyncStorage.multiRemove([
            GOOGLE_ACCESS_TOKEN_KEY,
            GOOGLE_REFRESH_TOKEN_KEY,
            GOOGLE_TOKEN_EXPIRES_AT_KEY,
          ]);
          setGoogleAccessTokenState(null);
          return null;
        }
        await AsyncStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, refreshed.accessToken);
        await AsyncStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, refreshed.refreshToken);
        await AsyncStorage.setItem(GOOGLE_TOKEN_EXPIRES_AT_KEY, String(refreshed.expiresAt));
        setGoogleAccessTokenState(refreshed.accessToken);
        return refreshed.accessToken;
      })();
    }
    try {
      return await refreshInFlight.current;
    } finally {
      refreshInFlight.current = null;
    }
  }, [googleAccessToken]);

  const saveClassroomTokens = useCallback(async (tokens: ClassroomTokens) => {
    await persistClassroomTokens(tokens);
    setClassroomAccountEmail(tokens.email);
  }, []);

  const unlinkClassroomAccount = useCallback(async () => {
    await revokeAndClearClassroomTokens();
    setClassroomAccountEmail(null);
  }, []);

  // Returns the school token if we have one (auto-refreshing if stale),
  // otherwise falls back to the primary Google token (also auto-refreshed
  // via the new code-flow). Use this for any Classroom API call.
  const getClassroomAccessToken = useCallback(async () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (clientId) {
      const linked = await getValidClassroomAccessToken(clientId);
      if (linked) return linked;
    }
    return getValidGoogleAccessToken();
  }, [getValidGoogleAccessToken]);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthContextValue['signUp'] = async (email, password, opts) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // If email confirmation is enabled, no session yet — user must confirm before profile creation
    if (!data.session) return { needsConfirm: true };

    // Create profile via SECURITY DEFINER RPC. The RPC returns the parent's family code,
    // or errors out for students with a bad family code (auth user remains, can retry).
    if (opts.role === 'parent') {
      const { data: code, error: rpcErr } = await supabase.rpc('signup_as_parent');
      if (rpcErr) return { error: rpcErr.message };
      return { familyCode: code as string };
    }

    if (!opts.familyCode?.trim()) return { error: 'Family code is required' };
    const { error: rpcErr } = await supabase.rpc('signup_as_student', { code: opts.familyCode });
    if (rpcErr) return { error: rpcErr.message };
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Revoke the primary refresh token (best-effort) so it can't be reused
    // even if AsyncStorage is recovered from a backup, then wipe local copies.
    const storedRefresh = await AsyncStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
    if (storedRefresh) await revokeGoogleToken(storedRefresh);
    await AsyncStorage.multiRemove([
      GOOGLE_ACCESS_TOKEN_KEY,
      GOOGLE_REFRESH_TOKEN_KEY,
      GOOGLE_TOKEN_EXPIRES_AT_KEY,
    ]);
    setGoogleAccessTokenState(null);
    // Sign-out also drops the secondary school account — local-only state, no
    // sense leaking it across users on a shared device.
    await revokeAndClearClassroomTokens();
    setClassroomAccountEmail(null);
  };

  const deleteAccount: AuthContextValue['deleteAccount'] = async () => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { error: error.message };
    // Server has deleted the auth user — local session token is now stale.
    // signOut clears it locally so the auth gate flips back to sign-in immediately.
    await supabase.auth.signOut();
    const storedRefresh = await AsyncStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
    if (storedRefresh) await revokeGoogleToken(storedRefresh);
    await AsyncStorage.multiRemove([
      GOOGLE_ACCESS_TOKEN_KEY,
      GOOGLE_REFRESH_TOKEN_KEY,
      GOOGLE_TOKEN_EXPIRES_AT_KEY,
    ]);
    setGoogleAccessTokenState(null);
    await revokeAndClearClassroomTokens();
    setClassroomAccountEmail(null);
    return {};
  };

  const signInWithGoogleIdToken: AuthContextValue['signInWithGoogleIdToken'] = async (
    idToken,
    { role, familyCode }
  ) => {
    // Trade the Google id_token for a Supabase session — no redirect URL involved
    const { data: setData, error: setErr } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (setErr || !setData.user) return { error: setErr?.message ?? 'Failed to establish session' };

    // First-time Google user → no profile yet. Create it from the form's role/code.
    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', setData.user.id)
      .maybeSingle();

    if (existing) return {}; // Returning user, profile exists, done.

    if (role === 'parent') {
      const { error: rpcErr } = await supabase.rpc('signup_as_parent');
      if (rpcErr) return { error: rpcErr.message };
      return {};
    }
    if (role === 'student' && familyCode?.trim()) {
      const { error: rpcErr } = await supabase.rpc('signup_as_student', { code: familyCode });
      if (rpcErr) return { error: rpcErr.message };
      return {};
    }

    // Authenticated but no role chosen — caller needs to prompt the user.
    return { needsRoleSetup: true };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        googleAccessToken,
        signIn,
        signUp,
        signOut,
        deleteAccount,
        signInWithGoogleIdToken,
        setGoogleAccessToken,
        setGoogleTokens,
        getValidGoogleAccessToken,
        classroomAccountEmail,
        saveClassroomTokens,
        unlinkClassroomAccount,
        getClassroomAccessToken,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
