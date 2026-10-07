// Wachtelaer Veldapp — klant opzoeken in Outsmart tijdens een
// klantenbezoek, als eerste stap van de "volledige workflow vanaf
// klantenbezoek". Outsmart's generieke filter-API ondersteunt enkel exacte
// matches (ontdekt via outsmart-probe: "like"/"contains" gedragen zich
// identiek aan "eq", geen substring-filtering server-side) — dus wordt hier
// de volledige relations-tabel opgehaald (geen filterbare naam-substring)
// en on-the-fly, server-side gefilterd op een losse substring-match, zodat
// de client enkel de (kleine) treffer-set binnenkrijgt, niet de ~9000 rijen.
//
// Bewust GEEN "nieuwe klant aanmaken" hier: Outsmart vereist zelf een
// debtor_number bij het aanmaken van een relation (niet auto-toegekend
// zoals bij offertes) — zelf een nummer verzinnen riskeert een botsing met
// Outsmart's eigen boekhoudkundige nummering. Nieuwe klanten blijven dus
// via Outsmart zelf aanmaken.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_PROFILE_ID = '97793265-0827-49e9-a611-64585da6ccaa';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Niet aangemeld' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user || user.id !== ALLOWED_PROFILE_ID) return json({ error: 'Geen toegang' }, 403);

  const base = Deno.env.get('OUTSMART_BASE_URL');
  const token = Deno.env.get('OUTSMART_CLIENT_TOKEN');
  const softwareToken = Deno.env.get('OUTSMART_SOFTWARE_TOKEN');
  if (!base || !token || !softwareToken) {
    return json({ error: 'Outsmart-koppeling is niet geconfigureerd (ontbrekende secrets)' }, 500);
  }

  let input: { query?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }
  const query = (input.query ?? '').trim().toLowerCase();
  if (query.length < 2) return json({ error: 'Geef minstens 2 tekens op om te zoeken' }, 400);

  try {
    const url = new URL(`${base}/relations/`);
    url.searchParams.set('token', token);
    url.searchParams.set('software_token', softwareToken);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    if (body.code !== 200) {
      throw new Error(Array.isArray(body.messages) && body.messages.length ? body.messages.join(', ') : `Outsmart-fout (${body.code})`);
    }
    const alle: any[] = body.response ?? [];

    const treffers = alle
      .filter((r) => (r.name ?? '').toLowerCase().includes(query))
      .slice(0, 20)
      .map((r) => ({
        debtorNr: r.debtor_number,
        naam: r.name,
        adres: [
          [r.street, r.house_number].filter(Boolean).join(' '),
          [r.postal_code, r.city].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(', ') || null,
        telefoon: r.phone_number || r.mobile || null,
        email: r.email || null,
        leadFase: r.lead_phase || null,
      }));

    return json({ klanten: treffers });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Zoeken mislukt' }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
