# Wachtelaer Veldapp

Internal field app for Wachtelaer BV (HVAC), built with Expo (React Native)
and Supabase. This implements phases of the design in
`project/Wachtelaer Veldapp.dc.html` (a Claude Design prototype — see
`chats/chat1.md` for the design conversation):

- **Phase 1 — werfrapporten**: daily site reports with photos, role-based
  visibility, and offline queueing.
- **Phase 2a — werfchat**: one group chat per site (text + photos), with an
  unread indicator on the thread list, also queued offline.
- **Phase 2b — verkoopmodule**: a `sales` user picks a domain (verwarming,
  airco, zonnepanelen + batterij, sanitair, ventilatie), fills a
  domain-specific questionnaire with a live "ontbreekt nog" completeness
  check, attaches photos, and sends it to the backoffice — offline-queued
  like everything else. No prices are captured; the verkoper measures, the
  backoffice quotes. A separate daily script (`scripts/backup-opmetingen/`)
  backs up every opmeting to a local PDF + photo zip.
- **Phase 2c — verlofaanvragen**: request leave (type/period/note) with a
  live check of which same-site colleagues are already off in that period;
  management approves or rejects, seeing a computed crew-availability note
  per request. Management also has an "Overzicht" of every request, sorted
  by period. Also offline-queued.
- **Phase 2d — plannen & documenten**: versioned plans/PDFs per site.
  Uploading a file under a title that already exists on that site creates
  a new version instead of a new document; the crew always sees the latest
  version first, with older ones collapsed underneath. A "nieuw" badge
  tracks what's been uploaded since a user's last visit (same pattern as
  werfchat's unread indicator). Upload is management-only for now.

All five phases from the prototype are now built.

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
   `0003_werfchat.sql`, `0004_verkoop_opmetingen.sql`,
   `0005_verlofaanvragen.sql`, `0006_plannen.sql`.
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
    werven/           werven list, werf detail, nieuw rapport, rapport view,
                      and (for sales) opmeting/modules|[mod]|klaar
    chat/             thread list (one per werf) + message thread
    plannen/          thread-list-style werven list + per-werf document list
    meer/             profile + sign out, and verlof (leave requests)
lib/
  api/                Supabase queries, one module per feature
  supabase.ts         client
  offlineQueue.ts      outbox + connectivity
  theme.ts            design tokens ported from project/_ds/.../styles.css
  salesModules.ts     the 5 domain questionnaires for the verkoopmodule
context/AuthProvider.tsx
supabase/migrations/  SQL schema + RLS policies
scripts/backup-opmetingen/  standalone daily backup script (see its own README)
project/, chats/      the original Claude Design handoff (reference only)
```

## Data model

`profiles` (role: tech/werfleider/sales/mgmt, plus `verlof_dagen` and
`inhaalrust_dagen` balances — management-adjustable via SQL for now, no
UI yet) · `werven` (sites) · `werf_members` (who's assigned where, and who
leads) · `werfrapporten` · `werfrapport_fotos` · `werfrapport_reacties` ·
`werf_chat_berichten` · `werf_chat_reads` · `opmetingen` · `opmeting_fotos` ·
`verlofaanvragen` · `plan_documenten` · `plan_versies` · `plan_reads`. RLS
enforces the same sharing rules as the prototype: a report is visible to
its author, to management (if shared with management), and to the site's
crew (if shared with the site); a werfchat thread is visible to
management and to that site's crew; an opmeting is visible to the
verkoper who created it and to management; a verlofaanvraag is visible to
its aanvrager, to management, and (while pending or approved) to that
person's werf-mates for conflict checking; a plan document/version is
visible to management and that site's crew, but only management can
upload — see the policies in the migrations for the exact rules.
