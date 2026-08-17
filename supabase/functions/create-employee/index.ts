// Wachtelaer Veldapp — creates a new employee account.
//
// This has to run server-side: creating an auth user requires the
// service_role key, which must never ship inside the app bundle (it
// bypasses every RLS policy). The app calls this function with the
// caller's own session token; the function checks that caller is
// management, then uses the service role internally to invite the new
// user by email. `handle_new_user` (see migration 0002) picks up
// full_name/role from the invite's user metadata and creates their
// profiles row automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['tech', 'werfleider', 'sales', 'mgmt'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Niet aangemeld' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Scoped to the caller's own JWT, purely to find out who's asking.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return json({ error: 'Niet aangemeld' }, 401);
  }

  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', user.id).single();
  if (callerProfile?.role !== 'mgmt') {
    return json({ error: 'Enkel management kan medewerkers aanmaken' }, 403);
  }

  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const full_name = body.full_name?.trim();
  const role = body.role;

  if (!email || !full_name || !role || !ROLES.includes(role)) {
    return json({ error: 'E-mail, naam en een geldige rol zijn verplicht' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role },
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ id: data.user?.id });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
