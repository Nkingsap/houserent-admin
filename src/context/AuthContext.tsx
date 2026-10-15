import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { bootstrapAdmin, getSetupStatus } from '../lib/adminApi';

interface AuthContextValue {
  session: Session | null;
  email: string | null;
  /** True only for accounts listed in public.admins — the panel is gated on this. */
  isAdmin: boolean;
  loading: boolean;
  /** True while the one-time first-admin bootstrap is still available. */
  setupRequired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  completeSetup: (input: { email: string; password: string; name: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSetupStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

/** Reads the caller's own row from public.admins (RLS allows self-read only). */
async function hasAdminRow(userId: string) {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refreshSetupStatus = useCallback(async () => {
    try {
      setSetupRequired(await getSetupStatus());
    } catch {
      // Leave the flag as-is if the function is unreachable.
    }
  }, []);

  // Bootstrap: restore any stored session, but only keep it if the account is an admin.
  useEffect(() => {
    let active = true;

    (async () => {
      await refreshSetupStatus();

      const { data } = await supabase.auth.getSession();
      const current = data.session;
      let admin = false;

      if (current) {
        admin = await hasAdminRow(current.user.id);
        if (!admin) await supabase.auth.signOut();
      }

      if (!active) return;
      setSession(admin ? current : null);
      setIsAdmin(admin);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [refreshSetupStatus]);

  // Keep the in-memory session in sync with token refreshes / external sign-out.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setIsAdmin(false);
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setSession((prev) => (prev && next ? next : prev));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(error.message);

    if (!(await hasAdminRow(data.user.id))) {
      await supabase.auth.signOut();
      throw new Error('This account does not have admin access to this panel.');
    }

    setSession(data.session);
    setIsAdmin(true);
  }, []);

  const completeSetup = useCallback(
    async (input: { email: string; password: string; name: string }) => {
      await bootstrapAdmin(input);
      setSetupRequired(false);
      await signIn(input.email, input.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      email: session?.user.email ?? null,
      isAdmin,
      loading,
      setupRequired,
      signIn,
      completeSetup,
      signOut,
      refreshSetupStatus,
    }),
    [session, isAdmin, loading, setupRequired, signIn, completeSetup, signOut, refreshSetupStatus],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
