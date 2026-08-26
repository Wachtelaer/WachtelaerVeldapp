// Wachtelaer Veldapp — reports whether each employee has accepted their
// invite yet (i.e. signed in at least once).
//
// This has to run server-side: `auth.admin.listUsers()` requires the
// service_role key, and `auth.users` isn't reachable from the client at
// all (no RLS-exposed table). The app calls this with the caller's own
// session token; the function checks that caller is management, then
// uses the service role internally to read sign-in status for everyone.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    return json({ error: 'Enkel management kan dit opvragen' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  // A single page comfortably covers this company's whole team; revisit
  // with real pagination if the team ever grows past 1000 people.
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return json({ error: error.message }, 400);
  }

  const status = data.users.map((u) => ({ id: u.id, heeftIngelogd: u.last_sign_in_at != null }));
  return json({ status });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
