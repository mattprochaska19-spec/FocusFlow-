import { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

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
  signInWithGoogleIdToken: (
    idToken: string,
    opts: { role?: SignUpRole; familyCode?: string }
  ) => Promise<{ error?: string; needsRoleSetup?: boolean }>;
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
      value={{ session, loading, signIn, signUp, signOut, deleteAccount, signInWithGoogleIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
