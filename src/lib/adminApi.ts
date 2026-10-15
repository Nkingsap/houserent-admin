import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
import type { AdminUserRow, ListingRow, Stats } from '../types';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-api`;

/**
 * Calls the admin-api Edge Function with the signed-in admin's session token.
 * Throws an Error carrying the function's own message so the UI can show it verbatim.
 */
async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response (e.g. a gateway error page) — fall through to the status message.
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

/**
 * Public: tells the login screen whether the one-time first-admin setup is still open.
 * The login screen and the auth bootstrap both ask for this on start-up, so the
 * result is cached briefly and concurrent callers share a single request.
 */
let setupStatusCache: { value: boolean; at: number } | null = null;
let setupStatusInflight: Promise<boolean> | null = null;

const SETUP_STATUS_TTL = 60_000;

export const getSetupStatus = (): Promise<boolean> => {
  if (setupStatusCache && Date.now() - setupStatusCache.at < SETUP_STATUS_TTL) {
    return Promise.resolve(setupStatusCache.value);
  }
  if (setupStatusInflight) return setupStatusInflight;

  setupStatusInflight = invoke<{ setupRequired: boolean }>('status')
    .then((r) => {
      setupStatusCache = { value: r.setupRequired, at: Date.now() };
      return r.setupRequired;
    })
    .finally(() => {
      setupStatusInflight = null;
    });

  return setupStatusInflight;
};

export const bootstrapAdmin = (payload: { email: string; password: string; name: string }) =>
  invoke<{ ok: true }>('bootstrapAdmin', payload).then((r) => {
    // Setup has just been completed, so reflect that immediately.
    setupStatusCache = { value: false, at: Date.now() };
    return r;
  });

export const listUsers = (params: { search?: string; role?: string } = {}) =>
  invoke<{ users: AdminUserRow[]; truncated: boolean }>('listUsers', params).then((r) => r.users);

export const createUser = (payload: Record<string, unknown>) =>
  invoke<{ ok: true; user: AdminUserRow }>('createUser', payload);

export const updateUser = (payload: {
  id: string;
  name: string;
  phone: string;
  role?: string;
}) => invoke<{ ok: true }>('updateUser', payload);

export const setUserPassword = (id: string, password: string) =>
  invoke<{ ok: true }>('setPassword', { id, password });

export const deleteUser = (id: string) => invoke<{ ok: true }>('deleteUser', { id });

export const getStats = () => invoke<{ stats: Stats }>('stats').then((r) => r.stats);

export const listListings = (params: { search?: string } = {}) =>
  invoke<{ listings: ListingRow[] }>('listListings', params).then((r) => r.listings);

export const setListingAvailable = (id: string, available: boolean) =>
  invoke<{ ok: true }>('setListingAvailable', { id, available });

export const deleteListing = (id: string) => invoke<{ ok: true }>('deleteListing', { id });
