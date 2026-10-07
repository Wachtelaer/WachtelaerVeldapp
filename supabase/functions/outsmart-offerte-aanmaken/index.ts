// Wachtelaer Veldapp — laat de AI-agent zelf een nieuwe offerte aanmaken in
// Outsmart voor een bestaande klant, op basis van een vrije-tekst
// omschrijving van het gevraagde werk + prijszetting afgeleid uit alle
// bestaande offerteregels. Autonoom per expliciete keuze van de gebruiker
// (geen goedkeuringsstap) — de aangemaakte offerte komt wel altijd binnen
// als Outsmart-status CONCEPT (intern, nooit verstuurd/zichtbaar voor de
// klant), bevestigd via een live test.
//
// Outsmart's schrijf-API is query-string geadresseerd, niet pad-gebaseerd
// (ontdekt via outsmart-probe): aanmaken = POST naar quotations/ zonder id.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_PROFILE_ID = '97793265-0827-49e9-a611-64585da6ccaa';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WACHTELAER_HEADER =
  '<p>Wachtelaer BV<br>Désiré De Bodtkaai, 25<br>9400, Ninove<br>België<br>Btw: BE 0464.608.125</p>';

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
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!base || !token || !softwareToken) {
    return json({ error: 'Outsmart-koppeling is niet geconfigureerd (ontbrekende secrets)' }, 500);
  }
  if (!anthropicKey) {
    return json({ error: 'ANTHROPIC_API_KEY ontbreekt — zet die als Edge Function secret in het Supabase-dashboard.' }, 500);
  }

  let input: { debtorNr?: string; klantNaam?: string; omschrijving?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }
  const debtorNr = (input.debtorNr ?? '').trim();
  const omschrijving = (input.omschrijving ?? '').trim();
  const klantNaam = (input.klantNaam ?? '').trim();
  if (!debtorNr || !omschrijving) {
    return json({ error: 'debtorNr en omschrijving zijn verplicht' }, 400);
  }

  try {
    // 1. Historische offerteregels ophalen als prijsreferentie.
    const histRes = await outsmartGet(base, token, softwareToken, 'quotations', {
      key: 'quo_status',
      operator: 'eq',
      value: 'ACCEPTED',
    });
    const historische: any[] = histRes.response ?? [];
    const referentieRegels = historische
      .flatMap((q) => q.qln_lines ?? [])
      .filter((l: any) => l.qln_description && Number(l.qln_price) > 0)
      .map((l: any) => ({
        omschrijving: l.qln_description,
        eenheid: l.qln_unit || null,
        prijs: Number(l.qln_price) || 0,
        inkoopprijs: Number(l.purchase_price) || 0,
        btw: Number(l.qln_vat_percentage) || 21,
        materiaalCode: l.qln_material_code || null,
      }))
      .slice(0, 400);

    // 2. Claude laten kiezen/voorstellen welke regels nodig zijn.
    const prompt = `Je bent een offerte-assistent voor Wachtelaer, een Belgische verwarmings- en sanitairinstallateur. Een klant vraagt het volgende werk:

Klant: ${klantNaam || '(onbekend)'}
Gevraagd werk: ${omschrijving}

Hieronder staat een lijst van regels uit eerder aanvaarde offertes (echte, actuele prijszetting van dit bedrijf). Gebruik ze als referentie om realistische offerteregels voor te stellen voor het gevraagde werk — kopieer gelijkaardige regels waar mogelijk (zelfde omschrijving/prijs), en pas aantallen aan op basis van wat logisch is voor het gevraagde werk. Verzin geen onrealistische prijzen; baseer je zoveel mogelijk op de referentieregels.

Referentieregels (JSON, max 400):
${JSON.stringify(referentieRegels)}

Antwoord UITSLUITEND met geldige JSON, exact in dit formaat, zonder uitleg erbuiten:
{"regels": [{"omschrijving": "<tekst>", "aantal": <getal>, "eenheid": "<bv. 'uur', 'stuk', 'm'>", "prijs": <getal, excl. btw per eenheid>, "inkoopprijs": <getal, kostprijs per eenheid, 0 als arbeid>, "btw": <21 of 6>}], "toelichting": "<max 1 korte zin, Nederlands, waarom deze regels>"}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      throw new Error(`Anthropic API-fout (${claudeRes.status}): ${errBody.slice(0, 300)}`);
    }
    const claudeBody = await claudeRes.json();
    const text: string = claudeBody.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Geen JSON gevonden in het antwoord van de agent');
    const parsed = JSON.parse(jsonMatch[0]);
    const voorgesteldeRegels: any[] = Array.isArray(parsed.regels) ? parsed.regels : [];
    if (voorgesteldeRegels.length === 0) throw new Error('De agent stelde geen offerteregels voor');

    // 3. Outsmart-offerteregels opbouwen (totalen zelf berekend, niet
    //    afhankelijk van server-side herberekening — onbevestigd of Outsmart
    //    dat doet).
    const qlnLines = voorgesteldeRegels.map((r, i) => {
      const aantal = Number(r.aantal) || 1;
      const prijs = Number(r.prijs) || 0;
      const btw = Number(r.btw) || 21;
      const totaalExcl = round2(aantal * prijs);
      const totaalVat = round2(totaalExcl * (btw / 100));
      return {
        qln_id: null,
        qln_quo_id: null,
        qln_order: String(i + 1),
        qln_material_code: r.materiaalCode ?? null,
        qln_description: String(r.omschrijving ?? '').slice(0, 500),
        qln_note: '',
        qln_unit: r.eenheid ?? '',
        qln_amount: aantal.toFixed(5),
        qln_price: prijs.toFixed(5),
        purchase_price: (Number(r.inkoopprijs) || 0).toFixed(5),
        qln_price_incl: round2(prijs * (1 + btw / 100)).toFixed(5),
        qln_vat_percentage: btw.toFixed(2),
        qln_discount: '0.00',
        qln_total: totaalExcl.toFixed(5),
        qln_total_discount: '0.00000',
        qln_total_vat: totaalVat.toFixed(5),
        qln_total_excl: totaalExcl.toFixed(5),
        qln_total_incl: round2(totaalExcl + totaalVat).toFixed(5),
        qln_hidden: '0',
        section: '',
        qln_billable: '1',
      };
    });

    const vandaag = new Date();
    const vervaldatum = new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000);
    const createPayload = {
      quo_quotation_debtor_nr: debtorNr,
      quotation_type: 'quotation',
      quo_currency_code: 'EUR',
      quo_currency_symbol: '€',
      quo_description: `AI-agent voorstel: ${omschrijving}`.slice(0, 500),
      quo_header: WACHTELAER_HEADER,
      quo_date: vandaag.toISOString().slice(0, 10),
      quo_due_date: vervaldatum.toISOString().slice(0, 10),
      quo_due_days: '30',
      tax_calculation_method: 'EXCLUDING',
      qln_lines: qlnLines,
    };

    const createRes = await outsmartPost(base, token, softwareToken, 'quotations', createPayload);
    const created = createRes.response;
    if (!created?.quo_id) {
      throw new Error('Outsmart gaf geen offerte-id terug na aanmaken');
    }

    const margeEuro = (created.qln_lines ?? []).reduce((som: number, l: any) => {
      const omzet = Number(l.qln_total_excl) || 0;
      const kost = (Number(l.purchase_price) || 0) * (Number(l.qln_amount) || 0);
      return som + (omzet - kost);
    }, 0);
    const bedragExcl = Number(created.quo_amount_excl) || 0;
    const margePercent = bedragExcl > 0 ? (margeEuro / bedragExcl) * 100 : null;

    return json({
      offerte: {
        nummer: created.quo_number_formatted,
        status: created.quo_status,
        bedrag: created.quo_amount,
        url: created.url ?? null,
        regels: qlnLines.map((l) => ({ omschrijving: l.qln_description, aantal: Number(l.qln_amount), eenheid: l.qln_unit, prijs: Number(l.qln_price) })),
        margeEuro,
        margePercent,
      },
      toelichting: parsed.toelichting ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Offerte aanmaken mislukt' }, 502);
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

async function outsmartPost(base: string, token: string, softwareToken: string, path: string, payload: unknown) {
  const url = new URL(`${base}/${path}/`);
  url.searchParams.set('token', token);
  url.searchParams.set('software_token', softwareToken);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (body.code !== 200) throw new Error(Array.isArray(body.messages) && body.messages.length ? body.messages.join(', ') : `Outsmart-fout (${body.code})`);
  return body;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
