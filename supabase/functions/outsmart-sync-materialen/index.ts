// Wachtelaer Veldapp — bouwt/ververst de gesynchroniseerde artikelcatalogus
// (public.outsmart_materialen) uit Outsmart's volledige 'materials'-resource
// (156k+ artikelen, ~50MB, maar snel op te halen: ~2s, vlakke records zonder
// geneste regels). Apart van outsmart-sync-referentie omdat dit een
// volledig ander Outsmart-endpoint is met een eigen ritme (artikelprijzen
// wijzigen veel minder vaak dan er nieuwe offertes bijkomen).
//
// outsmart-offerte-aanmaken gebruikt deze tabel (via pg_trgm-gelijkenis,
// zie vind_materiaal_match in migratie 0032) om voor elke voorgestelde
// offerteregel het echte artikelnummer + de actuele prijs te vinden i.p.v.
// te vertrouwen op wat Claude zelf voorstelt of op de bevroren prijs uit
// een oude offerte in de prijsreferentie-tabel.

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !token || !softwareToken) {
    return json({ error: 'Outsmart-koppeling is niet geconfigureerd (ontbrekende secrets)' }, 500);
  }
  if (!serviceRoleKey) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, 500);
  }

  try {
    const url = new URL(`${base}/materials/`);
    url.searchParams.set('token', token);
    url.searchParams.set('software_token', softwareToken);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    if (body.code !== 200) throw new Error(`Outsmart-fout (${body.code})`);
    const alle: any[] = body.response ?? [];

    // Enkel echte, zichtbare verkoopartikelen — interne/onzichtbare
    // artikelen horen niet in een offerte voor een klant.
    //
    // Outsmart's materials-resource bevat voor sommige codes meerdere
    // rijen (live vastgesteld — "code" is dus geen betrouwbare unieke
    // sleutel in de ruwe respons) — per code de rij met de hoogste prijs
    // bijhouden (voorkomt dat een lege/0-prijs-duplicaat een correcte rij
    // overschrijft).
    const byCode = new Map<string, { code: string; omschrijving: string; prijs: number; eenheid: string | null; btw_code: string | null }>();
    for (const m of alle) {
      if (m.visible === '0' || m.is_internal === '1' || !m.code || !m.description) continue;
      const code = String(m.code).trim();
      const prijs = Number(m.price) || 0;
      const bestaand = byCode.get(code);
      if (bestaand && bestaand.prijs >= prijs) continue;
      byCode.set(code, {
        code,
        omschrijving: String(m.description).slice(0, 500),
        prijs,
        eenheid: m.unit && m.unit !== '<Leeg>' ? m.unit : null,
        btw_code: m.vat_code || null,
      });
    }
    const rows = [...byCode.values()];

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: deleteError } = await adminClient
      .from('outsmart_materialen')
      .delete()
      .not('id', 'is', null);
    if (deleteError) throw new Error(deleteError.message);

    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insertError } = await adminClient
        .from('outsmart_materialen')
        .insert(rows.slice(i, i + BATCH));
      if (insertError) throw new Error(insertError.message);
    }

    return json({
      totaalArtikelenOpgehaald: alle.length,
      totaalArtikelenGesynchroniseerd: rows.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Synchronisatie mislukt' }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
