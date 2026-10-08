// Wachtelaer Veldapp — "Bestellingen" dashboard (hidden tab, zelfde account
// als "Project"): welk materiaal moet wanneer besteld worden, op basis van
// AANVAARDE offertes (nog niet uitgevoerd — dat is precies het moment
// waarop nog besteld moet worden; eenmaal UITGEVOERD is het materiaal al
// gebruikt/besteld), gekruist met de werkelijke voorraad in magazijn
// Bodtkaai 25.
//
// Voorraad komt uit Outsmart's 'warehouse-material' resource (ontdekt via
// de door de gebruiker aangeleverde Postman/OpenAPI-collectie — deze
// resource zat niet in de reeds gekende resources en is niet geraden via
// ~55 kandidaat-namen). Elke rij is er één (materiaal, magazijn)-combinatie
// met wsa_current_amount als huidige voorraad. Outsmart's key/operator/
// value-filters werken hier niet (zelfde live geteste resultaat als overal
// elders in deze integratie) — alles wordt dus opgehaald en client-side
// gefilterd op wsa_wse_code === '2' (bevestigd: dat is Bodtkaai 25).
//
// "Wanneer" wordt afgeleid uit het gekoppelde project (werf-fase/periode),
// via dezelfde tekstuele match als outsmart-pipeline ("Werkbon conform
// offerte <nummer>" in de project-omschrijving) — er bestaat geen
// betrouwbaardere koppeling. Zonder gekoppeld project is er geen
// uitvoeringsdatum gekend; die materialen komen onderaan, apart gemarkeerd.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_PROFILE_ID = '97793265-0827-49e9-a611-64585da6ccaa';
const BODTKAAI_WSE_CODE = '2';

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

  try {
    const [acceptedRes, activeProjectsRes, inactiveProjectsRes, warehouseMaterialRes] = await Promise.all([
      outsmartGet(base, token, softwareToken, 'quotations', { key: 'quo_status', operator: 'eq', value: 'ACCEPTED' }),
      outsmartGet(base, token, softwareToken, 'projects', { key: 'active', operator: 'eq', value: '1' }),
      outsmartGet(base, token, softwareToken, 'projects', { key: 'active', operator: 'eq', value: '0' }),
      outsmartGet(base, token, softwareToken, 'warehouse-material', {}),
    ]);

    const aanvaardeOffertes: any[] = acceptedRes.response ?? [];
    const alleProjecten: any[] = [...(activeProjectsRes.response ?? []), ...(inactiveProjectsRes.response ?? [])];
    const alleVoorraadRegels: any[] = warehouseMaterialRes.response ?? [];

    // Voorraad bij Bodtkaai 25: per artikel de bestaande rijen optellen
    // (eenzelfde artikel komt soms als meerdere rijen voor, telkens met een
    // deel van de voorraad) — order/optimal-drempels zijn een vaste
    // instelling per artikel, dus daarvan de hoogst gevonden waarde nemen.
    const voorraadPerArtikel = new Map<string, { voorradig: number; bestelDrempel: number; optimaleVoorraad: number }>();
    for (const r of alleVoorraadRegels) {
      if (String(r.wsa_wse_code ?? '') !== BODTKAAI_WSE_CODE) continue;
      const code = String(r.wsa_article_code ?? '').trim();
      if (!code) continue;
      const bestaand = voorraadPerArtikel.get(code) ?? { voorradig: 0, bestelDrempel: 0, optimaleVoorraad: 0 };
      bestaand.voorradig += Number(r.wsa_current_amount) || 0;
      bestaand.bestelDrempel = Math.max(bestaand.bestelDrempel, Number(r.wsa_order_amount) || 0);
      bestaand.optimaleVoorraad = Math.max(bestaand.optimaleVoorraad, Number(r.wsa_optimal_amount) || 0);
      voorraadPerArtikel.set(code, bestaand);
    }

    type Bijdrage = { offerteNummer: string; klantNaam: string | null; aantal: number; periodeStart: string | null };
    const perArtikel = new Map<
      string,
      { omschrijving: string; eenheid: string; totaalNodig: number; bijdragen: Bijdrage[] }
    >();

    for (const q of aanvaardeOffertes) {
      // Zelfde tekstuele koppeling als outsmart-pipeline: een project heeft
      // geen betrouwbaar FK-veld naar de offerte, enkel een omschrijving
      // die het offertenummer vermeldt.
      const project = alleProjecten.find((p) => (p.description ?? '').includes(q.quo_number_formatted));
      const periodeStart: string | null = project?.date_start || null;
      const klantNaam: string | null = q.quo_quotation_debtor_name || null;

      for (const l of q.qln_lines ?? []) {
        const code = String(l.qln_material_code ?? '').trim();
        if (!code) continue;
        const aantal = Number(l.qln_amount) || 0;
        if (aantal <= 0) continue;
        // Een paar oudere offerteregels hebben ook op arbeid (bv. "Werkuren
        // plaatser") toch een qln_material_code staan — dat zijn geen
        // bestelbare artikelen en horen niet in een bestellijst thuis.
        if (/\buren\b|\bwerkuren\b|\buur\b/i.test(String(l.qln_description ?? ''))) continue;

        const bestaand = perArtikel.get(code) ?? {
          omschrijving: l.qln_description || code,
          eenheid: l.qln_unit || '',
          totaalNodig: 0,
          bijdragen: [],
        };
        bestaand.totaalNodig += aantal;
        bestaand.bijdragen.push({
          offerteNummer: q.quo_number_formatted,
          klantNaam,
          aantal,
          periodeStart,
        });
        perArtikel.set(code, bestaand);
      }
    }

    const bestellijst = [...perArtikel.entries()].map(([code, info]) => {
      const voorraad = voorraadPerArtikel.get(code) ?? { voorradig: 0, bestelDrempel: 0, optimaleVoorraad: 0 };
      const tekort = round2(info.totaalNodig - voorraad.voorradig);
      const vroegsteDatum = info.bijdragen
        .map((b) => b.periodeStart)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;

      return {
        materiaalCode: code,
        omschrijving: info.omschrijving,
        eenheid: info.eenheid,
        totaalNodig: round2(info.totaalNodig),
        voorradig: round2(voorraad.voorradig),
        bestelDrempel: voorraad.bestelDrempel,
        tekort,
        opVoorraad: tekort <= 0,
        vroegsteDatum,
        offertes: info.bijdragen.sort((a, b) => (a.periodeStart ?? '').localeCompare(b.periodeStart ?? '')),
      };
    });

    // Niet op voorraad + vroegste uitvoeringsdatum eerst; items zonder
    // gekende datum (nog geen project) helemaal achteraan binnen hun groep.
    bestellijst.sort((a, b) => {
      if (a.opVoorraad !== b.opVoorraad) return a.opVoorraad ? 1 : -1;
      if (a.vroegsteDatum && b.vroegsteDatum) return a.vroegsteDatum.localeCompare(b.vroegsteDatum);
      if (a.vroegsteDatum) return -1;
      if (b.vroegsteDatum) return 1;
      return b.tekort - a.tekort;
    });

    return json({ bestellijst });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Outsmart-aanvraag mislukt' }, 502);
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function outsmartGet(base: string, token: string, softwareToken: string, path: string, params: Record<string, string>) {
  const url = new URL(`${base}/${path}/`);
  url.searchParams.set('token', token);
  url.searchParams.set('software_token', softwareToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (body.code !== 200) throw new Error(Array.isArray(body.messages) && body.messages.length ? body.messages.join(', ') : `Outsmart-fout (${body.code})`);
  return body;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
