import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Locally: copy .env.example to ' +
      '.env.local and fill it in. On a host: set both in the project environment variables ' +
      'and redeploy — Vite inlines them at build time.',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_KEY = publishableKey;

/** Browser client. Only used for auth + the admins self-check — all data goes via the Edge Function. */
export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'houserent-admin-auth',
  },
});
