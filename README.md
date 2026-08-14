# Wachtelaer Veldapp

Internal field app for Wachtelaer BV (HVAC), built with Expo (React Native)
and Supabase. This implements phases of the design in
`project/Wachtelaer Veldapp.dc.html` (a Claude Design prototype — see
`chats/chat1.md` for the design conversation):

- **Phase 1 — werfrapporten**: daily site reports with photos, role-based
  visibility, and offline queueing.
- **Phase 2a — werfchat**: one group chat per site (text + photos), with an
  unread indicator on the thread list, also queued offline.

Plannen/documenten, verlofaanvragen, and the sales/opmeting module are in the
prototype but not yet built here; they're the natural next phases.

## Stack

- **App**: Expo (React Native + expo-router), TypeScript
- **Backend**: Supabase (Postgres, Auth, Storage, Row Level Security)
- **Offline**: local outbox (AsyncStorage) that auto-flushes on reconnect

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/` **in order** against it (via
   the SQL editor, or `supabase db push` if you use the Supabase CLI
   locally): `0001_werfrapporten.sql`, `0002_harden_helper_functions.sql`,
   `0003_werfchat.sql`.
3. Optionally run `supabase/seed.sql` for the three demo werven from the
   prototype.
4. Create employee accounts under Authentication → Users (or have them sign
   up). Each gets a `profiles` row automatically (role defaults to `tech`).
   Update `profiles.role` to `werfleider`, `sales`, or `mgmt` as needed, and
   add rows to `werf_members` (with `is_leider = true` for the werfleider on
   a site) so people can see and report on their sites — this also
   determines who's in each site's werfchat.

### 2. App config

```
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
your Supabase project's API settings.

### 3. Run it

```
npm install
npm run ios      # or: npm run android / npm run web
```

## Project layout

```
app/                  expo-router screens (file-based routing)
  sign-in.tsx
  (tabs)/
    werven/           werven list, werf detail, nieuw rapport, rapport view
    chat/             thread list (one per werf) + message thread
    plannen.tsx       stub — phase 2
    meer.tsx          profile + sign out
lib/
  api/                Supabase queries, one module per feature
  supabase.ts         client
  offlineQueue.ts      outbox + connectivity
  theme.ts            design tokens ported from project/_ds/.../styles.css
context/AuthProvider.tsx
supabase/migrations/  SQL schema + RLS policies
project/, chats/      the original Claude Design handoff (reference only)
```

## Data model

`profiles` (role: tech/werfleider/sales/mgmt) · `werven` (sites) ·
`werf_members` (who's assigned where, and who leads) · `werfrapporten` ·
`werfrapport_fotos` · `werfrapport_reacties` · `werf_chat_berichten` ·
`werf_chat_reads`. RLS enforces the same sharing rules as the prototype: a
report is visible to its author, to management (if shared with
management), and to the site's crew (if shared with the site); a werfchat
thread is visible to management and to that site's crew — see the
policies in the migrations for the exact rules.
