# RentHub Admin

Web admin panel for the RentHub rental platform. Lets administrators manage **tenants and
property owners**, moderate **listings**, and see platform-wide numbers.

It is a standalone static SPA — separate from the Expo app (`../houserent`) and the Cloudflare
Worker API (`../houserent-backend`). Neither of those needs to change for this to work.

---

## Stack

- **Vite + React 19 + TypeScript** SPA
- **Supabase Auth** for sign-in, **Supabase Postgres** as the data store
- **One Supabase Edge Function** (`admin-api`) as the only privileged server component

## Architecture

```
browser (Vite SPA)
  ├─ Supabase Auth  ──────────────►  auth.users          (login / session only)
  ├─ public.admins  ──────────────►  self-read check     (RLS: user_id = auth.uid())
  └─ Edge Function 'admin-api'  ──►  service role        (all reads/writes)
```

**The browser never holds the service-role key.** It signs in with the Supabase *publishable*
key, then calls the Edge Function, which:

1. validates the caller's JWT,
2. checks the caller is listed in `public.admins`,
3. performs the operation with the service role.

Sending every data operation through one function means the app's existing RLS policies are
left exactly as they are, and `public.users` (which stores plaintext passwords) is never
readable by the browser.

### Users live in two places

The platform has a canonical identity (`auth.users` + `public.profiles`) **and** a legacy
mirror (`public.users`) that the mobile app's worker reads. The panel keeps both in sync:
creating, editing, promoting or deleting a user updates both stores, and change — plus
password resets — go through Supabase Auth so the mobile app keeps working.

## First-run setup

The `public.admins` table starts empty. While it is empty, the login screen shows a
**"Create the first administrator account"** form. That one-time action:

- creates the Supabase Auth user (email pre-confirmed),
- adds it to `public.admins`,
- and sign in you straight away.

From that moment on the bootstrap path is permanently disabled (`Setup has already been
completed`), and only accounts in `public.admins` can reach the panel.

> Complete this step immediately after deploying to a public URL.

## Local development

```bash
npm install
cp .env.example .env.local    # then fill in the two values
npm run dev
```

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → publishable key (`sb_publishable_…`) |

Both are safe to expose to the browser.

## Deployment (Vercel)

1. Import this folder as a Vercel project (framework preset **Vite**).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Settings → Environment Variables**.
3. Deploy. `vercel.json` already rewrites client-side routes to `index.html`.
4. Add the deployed URL to Supabase → **Authentication → URL Configuration** if you enable
   email flows later.

## What each screen does

| Screen | Capabilities |
| --- | --- |
| **Login** | Admin sign-in, or one-time first-admin creation |
| **Dashboard** | Tenants / owners / listings / saved-homes / new-signups counts, newest accounts |
| **Users** | Search + role filter, create user, edit name/phone/role, reset password, delete |
| **Listings** | Search, take a listing offline / publish it, delete a listing |

## Database objects

Created by migration `create_admins_table`:

```sql
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
```

- RLS is enabled; the only policy lets a signed-in user read **their own** row.
- Admins are granted exclusively through the service role (the Edge Function's bootstrap).
  There is deliberately no insert/update/delete policy, so the browser cannot grant itself admin.

## Safety rails

- `deleteUser` refuses to delete your own account, and refuses to delete the **last** admin.
- Deleting a user removes the auth user, its profile (cascade) and the legacy mirror row.
- Passwords are never returned by the API and are never logged.
- The Edge Function returns its own error messages so the UI can display them verbatim.

## Edge Function source

`supabase/functions/admin-api/index.ts` is the deployed source of truth. It is deployed
through the Supabase MCP tooling, not by CI.

## Known gaps (pre-existing, out of scope here)

- `public.users.password` stores **plaintext** passwords and the anon key can read that table.
  This panel does not expose it, but the underlying issue lives in the mobile app's auth flow.
- Auth users are listed up to 1,000 per request; the Users screen flags truncation if that is
  ever hit.
# houserent-admin
