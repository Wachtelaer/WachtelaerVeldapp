// Wachtelaer Veldapp — bouwt/ververst twee leerdata-tabellen uit ALLE
// offertes in Outsmart, in één en dezelfde fetch:
//
//   1. public.outsmart_prijsreferentie — gededupliceerde prijs/artikel-
//      referentie uit offertes van elke status (aanvaard, uitgevoerd,
//      geweigerd, concept, ...) — ook niet-aanvaarde offertes bevatten
//      bruikbare prijszetting.
//   2. public.outsmart_duurreferentie — per UITGEVOERDE (EXECUTED) offerte
//      de werkelijk bestede uren per hourtype-rol, zodat de agent het
//      AANTAL uren voor een nieuwe klus kan gronden op vergelijkbare,
//      echt afgewerkte klussen in plaats van vrij te gokken.
//
// Dit is bewust een aparte, manueel te triggeren sync-stap: alle offertes
// in één keer ophalen duurt ~10s en ~57MB (2022 offertes, ~34k regels) —
// te traag om bij elke offerte-aanmaak live te doen. outsmart-offerte-
// aanmaken leest nadien enkel nog uit deze kleine, snelle tabellen.

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
    const url = new URL(`${base}/quotations/`);
    url.searchParams.set('token', token);
    url.searchParams.set('software_token', softwareToken);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    if (body.code !== 200) throw new Error(`Outsmart-fout (${body.code})`);
    const alle: any[] = body.response ?? [];

    // Per uniek artikel/dienst (materiaal_code, anders omschrijving) enkel
    // de meest recente regel bijhouden, over alle offertes/statussen heen.
    const byKey = new Map<string, { row: any; datum: string; count: number }>();
    for (const q of alle) {
      const datum: string = q.quo_date ?? '';
      for (const l of q.qln_lines ?? []) {
        if (!l.qln_description || !(Number(l.qln_price) > 0)) continue;
        const sleutel = (l.qln_material_code || l.qln_description).toString().toLowerCase().trim();
        if (!sleutel) continue;
        const bestaand = byKey.get(sleutel);
        if (bestaand) {
          bestaand.count += 1;
          if (datum > bestaand.datum) {
            bestaand.row = l;
            bestaand.datum = datum;
          }
        } else {
          byKey.set(sleutel, { row: l, datum, count: 1 });
        }
      }
    }

    const rows = [...byKey.entries()].map(([sleutel, { row: l, datum, count }]) => ({
      sleutel,
      materiaal_code: l.qln_material_code || null,
      omschrijving: String(l.qln_description).slice(0, 500),
      eenheid: l.qln_unit || null,
      prijs: Number(l.qln_price) || 0,
      inkoopprijs: Number(l.purchase_price) || 0,
      btw: Number(l.qln_vat_percentage) || 21,
      laatst_gebruikt: datum || null,
      aantal_offertes: count,
    }));

    // Duurreferentie: enkel offertes met status UITGEVOERD leveren
    // betrouwbare "dit is hoeveel uur dit écht gekost heeft"-data op — een
    // CONCEPT of GEWEIGERDE offerte zegt niets over de werkelijke duur.
    const duurRows: any[] = [];
    for (const q of alle) {
      if (q.quo_status !== 'EXECUTED') continue;
      const omschrijvingKlus = String(q.quo_description || q.quo_reference || '').trim();
      if (!omschrijvingKlus) continue;
      const urenPerHourtype: Record<string, number> = {};
      for (const l of q.qln_lines ?? []) {
        if (!l.qln_material_hourtype) continue;
        const code = String(l.qln_material_hourtype);
        const aantal = Number(l.qln_amount) || 0;
        if (aantal <= 0) continue;
        urenPerHourtype[code] = (urenPerHourtype[code] ?? 0) + aantal;
      }
      const totaalUren = Object.values(urenPerHourtype).reduce((a, b) => a + b, 0);
      if (totaalUren <= 0) continue;
      duurRows.push({
        quo_id: String(q.quo_id),
        omschrijving: omschrijvingKlus.slice(0, 500),
        datum: q.quo_date || null,
        uren: urenPerHourtype,
        totaal_uren: totaalUren,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Oude rijen eerst wegdoen — anders blijven artikelen/klussen die niet
    // meer voorkomen in Outsmart voor altijd in onze referentie staan.
    const { error: deleteError } = await adminClient
      .from('outsmart_prijsreferentie')
      .delete()
      .not('id', 'is', null);
    if (deleteError) throw new Error(deleteError.message);
    const { error: deleteDuurError } = await adminClient
      .from('outsmart_duurreferentie')
      .delete()
      .not('id', 'is', null);
    if (deleteDuurError) throw new Error(deleteDuurError.message);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insertError } = await adminClient
        .from('outsmart_prijsreferentie')
        .insert(rows.slice(i, i + BATCH));
      if (insertError) throw new Error(insertError.message);
    }
    for (let i = 0; i < duurRows.length; i += BATCH) {
      const { error: insertDuurError } = await adminClient
        .from('outsmart_duurreferentie')
        .insert(duurRows.slice(i, i + BATCH));
      if (insertDuurError) throw new Error(insertDuurError.message);
    }

    return json({
      totaalOffertesVerwerkt: alle.length,
      uniekeArtikelen: rows.length,
      uitgevoerdeKlussenMetUren: duurRows.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Synchronisatie mislukt' }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
