// houserent admin-api — Supabase Edge Function
//
// The only component holding the service-role key. Every action below authenticates
// the caller itself (the function is deployed with verify_jwt disabled on purpose),
// then requires membership in public.admins — except `status` and the self-limiting
// one-time `bootstrapAdmin`.
//
// Never returns passwords or keys.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['tenant', 'owner'];
const MAX_AUTH_USERS = 1000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const fail = (error: string, status = 400) => json({ error }, status);

/** Service-role client — bypasses RLS. Never leaves the server. */
const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
  lastSignInAt: string | null;
  emailConfirmed: boolean | null;
  hasProfile: boolean;
  hasLegacyRow: boolean;
};

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function countRows(db: SupabaseClient, table: string, apply?: (q: any) => any) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function adminCount(db: SupabaseClient) {
  return countRows(db, 'admins');
}

async function isAdmin(db: SupabaseClient, userId: string) {
  const { data } = await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

/** Validates the caller's Supabase Auth JWT and confirms admin membership. */
async function requireAdmin(db: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: fail('Missing bearer token', 401) };

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { error: fail('Invalid or expired session', 401) };
  if (!(await isAdmin(db, data.user.id))) return { error: fail('Admin access required', 403) };

  return { user: data.user };
}

/** Merges the auth user, its profile row, and the legacy public.users mirror. */
async function listUsers(db: SupabaseClient) {
  const [profilesRes, legacyRes, authRes] = await Promise.all([
    db.from('profiles').select('id,name,phone,role,created_at'),
    db.from('users').select('id,email,phone,role,created_at'),
    db.auth.admin.listUsers({ page: 1, perPage: MAX_AUTH_USERS }),
  ]);

  if (profilesRes.error) throw new Error(`profiles: ${profilesRes.error.message}`);
  if (legacyRes.error) throw new Error(`users: ${legacyRes.error.message}`);
  if (authRes.error) throw new Error(`auth: ${authRes.error.message}`);

  const merged = new Map<string, AdminUser>();

  const blank = (id: string): AdminUser => ({
    id,
    email: null,
    name: null,
    phone: null,
    role: null,
    created_at: null,
    lastSignInAt: null,
    emailConfirmed: null,
    hasProfile: false,
    hasLegacyRow: false,
  });

  for (const p of profilesRes.data ?? []) {
    const row = merged.get(p.id) ?? blank(p.id);
    row.name = p.name ?? row.name;
    row.phone = p.phone ?? row.phone;
    row.role = p.role ?? row.role;
    row.created_at = p.created_at ?? row.created_at;
    row.hasProfile = true;
    merged.set(p.id, row);
  }

  for (const l of legacyRes.data ?? []) {
    const row = merged.get(l.id) ?? blank(l.id);
    row.email = l.email ?? row.email;
    row.name = row.name ?? l.name ?? null;
    row.phone = row.phone ?? l.phone ?? null;
    row.role = row.role ?? l.role ?? null;
    row.created_at = row.created_at ?? l.created_at ?? null;
    row.hasLegacyRow = true;
    merged.set(l.id, row);
  }

  for (const u of authRes.data.users ?? []) {
    const row = merged.get(u.id) ?? blank(u.id);
    row.email = u.email ?? row.email;
    row.lastSignInAt = u.last_sign_in_at ?? null;
    row.emailConfirmed = Boolean(u.email_confirmed_at);
    row.created_at = row.created_at ?? u.created_at ?? null;
    merged.set(u.id, row);
  }

  return [...merged.values()];
}

function validateUserPayload(body: Record<string, unknown>, { requirePassword }: { requirePassword: boolean }) {
  const email = asString(body.email).toLowerCase();
  const name = asString(body.name);
  const phone = asString(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  const role = ROLES.includes(asString(body.role)) ? asString(body.role) : 'tenant';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'A valid email address is required' };
  }
  if (!name) return { error: 'Name is required' };
  if (requirePassword && password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }
  return { value: { email, name, phone: phone || null, password, role } };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const db = admin();

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const action = asString(body.action);
  const payload = (body.payload ?? {}) as Record<string, any>;

  try {
    // ── Unauthenticated: is first-run setup still pending? ────────────────────
    if (action === 'status') {
      return json({ setupRequired: (await adminCount(db)) === 0 });
    }

    // ── One-time first-admin bootstrap (disabled the moment an admin exists) ──
    if (action === 'bootstrapAdmin') {
      if ((await adminCount(db)) > 0) return fail('Setup has already been completed', 403);

      const parsed = validateUserPayload({ ...payload, role: 'tenant' }, { requirePassword: true });
      if ('error' in parsed) return fail(parsed.error!);

      const { email, name, password } = parsed.value!;
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (createErr) return fail(createErr.message, 500);

      const { error: adminErr } = await db
        .from('admins')
        .insert({ user_id: created.user.id, email });
      if (adminErr) return fail(adminErr.message, 500);

      return json({ ok: true, user: { id: created.user.id, email } }, 201);
    }

    // ── Everything else requires an authenticated admin ──────────────────────
    const auth = await requireAdmin(db, req);
    if (auth.error) return auth.error;
    const me = auth.user!;

    switch (action) {
      case 'listUsers': {
        const search = asString(payload.search).toLowerCase();
        const role = asString(payload.role);
        let users = await listUsers(db);

        if (role && ROLES.includes(role)) users = users.filter((u) => u.role === role);
        if (search) {
          users = users.filter((u) =>
            [u.email, u.name, u.phone].some((f) => (f ?? '').toLowerCase().includes(search)),
          );
        }

        users.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        return json({ users, truncated: users.length >= MAX_AUTH_USERS });
      }

      case 'createUser': {
        const parsed = validateUserPayload(payload, { requirePassword: true });
        if ('error' in parsed) return fail(parsed.error!);
        const { email, name, phone, password, role } = parsed.value!;

        const { data: created, error: createErr } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role },
        });
        if (createErr) return fail(createErr.message, 500);

        const id: string = created.user.id;

        // Keep both stores in sync: canonical profile + legacy mirror the app's worker reads.
        const { error: profileErr } = await db
          .from('profiles')
          .upsert({ id, name, phone, role }, { onConflict: 'id' });
        if (profileErr) return fail(`profile: ${profileErr.message}`, 500);

        const { error: legacyErr } = await db
          .from('users')
          .upsert({ id, email, password, name, phone, role }, { onConflict: 'id' });
        if (legacyErr) return fail(`users mirror: ${legacyErr.message}`, 500);

        return json({ ok: true, user: { id, email, name, phone, role } }, 201);
      }

      case 'updateUser': {
        const id = asString(payload.id);
        if (!isUuid(id)) return fail('A valid user id is required');

        const name = asString(payload.name);
        const phone = asString(payload.phone);
        const role = asString(payload.role);

        if (!name) return fail('Name is required');
        if (role && !ROLES.includes(role)) return fail('Role must be tenant or owner');

        const profilePatch: Record<string, unknown> = { name, phone: phone || null };
        if (role) profilePatch.role = role;

        const { error: profileErr } = await db.from('profiles').update(profilePatch).eq('id', id);
        if (profileErr) return fail(`profile: ${profileErr.message}`, 500);

        // The legacy mirror may not have a row for every account; update if present.
        const { error: legacyErr } = await db.from('users').update(profilePatch).eq('id', id);
        if (legacyErr) return fail(`users mirror: ${legacyErr.message}`, 500);

        return json({ ok: true });
      }

      case 'setPassword': {
        const id = asString(payload.id);
        const password = typeof payload.password === 'string' ? payload.password : '';
        if (!isUuid(id)) return fail('A valid user id is required');
        if (password.length < 8) return fail('Password must be at least 8 characters');

        const { error } = await db.auth.admin.updateUserById(id, { password });
        if (error) return fail(error.message, 500);

        // Keep the legacy login working with the new credential.
        await db.from('users').update({ password }).eq('id', id);

        return json({ ok: true });
      }

      case 'deleteUser': {
        const id = asString(payload.id);
        if (!isUuid(id)) return fail('A valid user id is required');
        if (id === me.id) return fail('You cannot delete your own account');

        // Admins are deletable, but never the last one — that would lock everyone out.
        if (await isAdmin(db, id)) {
          if ((await adminCount(db)) <= 1) return fail('Cannot delete the last admin account');
          await db.from('admins').delete().eq('user_id', id);
        }

        await db.from('users').delete().eq('id', id);

        // Tolerate an auth account that is already gone (for example one removed from the
        // Supabase dashboard). public.users has no FK to auth.users, so such accounts leave
        // an orphaned mirror row behind — clearing it here is the fix, not a failure.
        const { error } = await db.auth.admin.deleteUser(id);
        if (error && !/not\s*found|does not exist/i.test(error.message)) {
          return fail(error.message, 500);
        }

        return json({ ok: true });
      }

      case 'stats': {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [tenants, owners, listings, availableListings, favorites, newSignups] =
          await Promise.all([
            countRows(db, 'profiles', (q) => q.eq('role', 'tenant')),
            countRows(db, 'profiles', (q) => q.eq('role', 'owner')),
            countRows(db, 'listings'),
            countRows(db, 'listings', (q) => q.eq('available', true)),
            countRows(db, 'favorites'),
            countRows(db, 'profiles', (q) => q.gte('created_at', since)),
          ]);

        return json({
          stats: {
            tenants,
            owners,
            users: tenants + owners,
            listings,
            availableListings,
            unavailableListings: Math.max(listings - availableListings, 0),
            favorites,
            newSignups,
          },
        });
      }

      case 'listListings': {
        const search = asString(payload.search).toLowerCase();
        const { data, error } = await db
          .from('listings')
          .select('id,owner_id,title,price,type,city,address,available,images,created_at')
          .order('created_at', { ascending: false });
        if (error) return fail(error.message, 500);

        const ownerIds = [...new Set((data ?? []).map((l) => l.owner_id).filter(Boolean))];
        const names = new Map<string, string>();
        if (ownerIds.length) {
          const { data: owners } = await db.from('profiles').select('id,name').in('id', ownerIds);
          for (const o of owners ?? []) names.set(o.id, o.name);
        }

        let listings = (data ?? []).map((l) => ({
          ...l,
          owner_name: names.get(l.owner_id) ?? null,
        }));
        if (search) {
          listings = listings.filter((l) =>
            [l.title, l.city, l.address, l.owner_name]
              .some((f) => (f ?? '').toLowerCase().includes(search)),
          );
        }

        return json({ listings });
      }

      case 'setListingAvailable': {
        const id = asString(payload.id);
        if (!isUuid(id)) return fail('A valid listing id is required');
        if (typeof payload.available !== 'boolean') return fail('available must be a boolean');

        const { error } = await db
          .from('listings')
          .update({ available: payload.available })
          .eq('id', id);
        if (error) return fail(error.message, 500);
        return json({ ok: true });
      }

      case 'deleteListing': {
        const id = asString(payload.id);
        if (!isUuid(id)) return fail('A valid listing id is required');

        const { error } = await db.from('listings').delete().eq('id', id);
        if (error) return fail(error.message, 500);
        return json({ ok: true });
      }

      default:
        return fail(`Unknown action: ${action || '(none)'}`, 400);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Unexpected server error', 500);
  }
});
