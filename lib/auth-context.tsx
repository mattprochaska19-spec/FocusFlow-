import { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Calendar scope is requested at sign-in so the access token is later usable
// for Google Calendar API calls without a second consent prompt.
const GOOGLE_SCOPES = [
  'email',
  'profile',
  'openid',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export type SignUpRole = 'parent' | 'student';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    opts: { role: SignUpRole; familyCode?: string }
  ) => Promise<{ error?: string; needsConfirm?: boolean; familyCode?: string }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
  signInWithGoogle: (opts: { role?: SignUpRole; familyCode?: string }) => Promise<{ error?: string; needsRoleSetup?: boolean }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

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
  };

  const deleteAccount: AuthContextValue['deleteAccount'] = async () => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { error: error.message };
    // Server has deleted the auth user — local session token is now stale.
    // signOut clears it locally so the auth gate flips back to sign-in immediately.
    await supabase.auth.signOut();
    return {};
  };

  const signInWithGoogle: AuthContextValue['signInWithGoogle'] = async ({ role, familyCode }) => {
    const redirectTo = AuthSession.makeRedirectUri();

    // Ask Supabase for the Google OAuth URL. skipBrowserRedirect lets us drive
    // the in-app browser ourselves so the redirect can come back as a deep link.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: GOOGLE_SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error || !data?.url) return { error: error?.message ?? 'Could not start Google sign-in' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') return { error: 'Sign-in cancelled' };
    if (result.type !== 'success') return { error: 'Sign-in failed' };

    // Supabase returns the session in the URL fragment; pull tokens and set the session
    const { params, errorCode } = QueryParams.getQueryParams(result.url);
    if (errorCode) return { error: errorCode };
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    if (!accessToken || !refreshToken) return { error: 'Missing tokens in OAuth response' };

    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
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
      value={{ session, loading, signIn, signUp, signOut, deleteAccount, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
