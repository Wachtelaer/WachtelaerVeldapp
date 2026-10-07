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
    // 1. Prijsreferentie ophalen — uit de gesynchroniseerde tabel
    //    (outsmart_prijsreferentie), gebouwd uit ALLE offertes in Outsmart
    //    (elke status, niet enkel aanvaard — zie outsmart-sync-referentie).
    //    Live alles ophalen is te traag (2022 offertes, ~10s, ~57MB), dus
    //    deze tabel wordt apart/periodiek bijgewerkt en hier enkel gelezen.
    //    Daarna op relevantie voor déze aanvraag geselecteerd (woord-
    //    overlap met de omschrijving), niet blind afgekapt.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let referentieRegels: any[] = [];
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: referentieRows } = await adminClient
        .from('outsmart_prijsreferentie')
        .select('omschrijving, eenheid, prijs, inkoopprijs, btw, materiaal_code, laatst_gebruikt');
      if (referentieRows && referentieRows.length > 0) {
        const alle = referentieRows.map((r) => ({
          omschrijving: r.omschrijving,
          eenheid: r.eenheid,
          prijs: Number(r.prijs) || 0,
          inkoopprijs: Number(r.inkoopprijs) || 0,
          btw: Number(r.btw) || 21,
          materiaalCode: r.materiaal_code,
          laatstGebruikt: r.laatst_gebruikt,
        }));
        referentieRegels = kiesRelevanteReferentie(omschrijving, alle, 200);
      }
    }

    // Terugval: tabel nog niet gesynchroniseerd — live aanvaarde offertes
    // ophalen zoals voorheen (kleine, snelle deelverzameling).
    const histRes = await outsmartGet(base, token, softwareToken, 'quotations', {
      key: 'quo_status',
      operator: 'eq',
      value: 'ACCEPTED',
    });
    const historische: any[] = histRes.response ?? [];
    if (referentieRegels.length === 0) {
      referentieRegels = historische
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
    }

    // 1b. Outsmart vereist een "scheme" (quo_qus_id) om een offerte aan te
    //     maken ("Scheme not found" anders) — dat blijkt een eigenschap van
    //     de KLANT te zijn (altijd hetzelfde binnen alle offertes van
    //     eenzelfde debiteur, ontdekt via outsmart-probe), niet iets dat
    //     Outsmart zelf toekent. Haal het dus op uit deze klant zijn eigen
    //     offerte-historie; bij een klant zonder eigen historie (echt
    //     nieuw) valt terug op de meest voorkomende scheme bedrijfsbreed.
    const debtorQuotesRes = await outsmartGet(base, token, softwareToken, 'quotations', {
      key: 'quo_quotation_debtor_nr',
      operator: 'eq',
      value: debtorNr,
    }).catch(() => ({ response: [] }));
    const debtorQuotes: any[] = debtorQuotesRes.response ?? [];
    const resolvedQusId =
      debtorQuotes.find((q) => q.quo_qus_id)?.quo_qus_id ?? pickMostCommonQusId(historische);
    if (!resolvedQusId) {
      throw new Error('Kon geen quotation-scheme (quo_qus_id) bepalen voor deze klant');
    }

    // 1c. Werkuren horen niet als generieke "Werkuren"-materiaalregel in de
    //     offerte, maar als een echt uren-type (qln_material_hourtype) per
    //     rol — Outsmart heeft daar een eigen, klein vast catalogus voor.
    const hourtypesRes = await outsmartGet(base, token, softwareToken, 'hourtypes', {});
    const hourtypes: any[] = (hourtypesRes.response ?? []).filter((h: any) => h.active !== '0');
    const hourtypesByCode = new Map(hourtypes.map((h) => [String(h.code), h]));
    const hourtypeNaamByCode = new Map(hourtypes.map((h) => [String(h.code), h.name]));

    // 1d. Duurreferentie: het AANTAL uren voor een klus werd tot nu toe
    //     volledig door Claude zelf geschat, zonder enige onderbouwing —
    //     in tegenstelling tot de prijs/kostprijs, die wél uit de
    //     hourtypes-catalogus komt. Deze tabel (gebouwd uit offertes met
    //     status UITGEVOERD, zie outsmart-sync-referentie) geeft per
    //     vergelijkbare, écht afgewerkte klus de werkelijk bestede uren per
    //     rol — zodat de agent zich daarop kan baseren i.p.v. vrij te gokken.
    let duurReferentie: any[] = [];
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: duurRows } = await adminClient
        .from('outsmart_duurreferentie')
        .select('omschrijving, uren, totaal_uren, datum');
      if (duurRows && duurRows.length > 0) {
        const alleDuur = duurRows.map((r) => ({
          omschrijving: r.omschrijving,
          urenPerRol: Object.fromEntries(
            Object.entries((r.uren as Record<string, number>) ?? {}).map(([code, uren]) => [
              hourtypeNaamByCode.get(code) ?? code,
              uren,
            ])
          ),
          totaalUren: Number(r.totaal_uren) || 0,
          datum: r.datum,
        }));
        duurReferentie = kiesRelevanteReferentie(omschrijving, alleDuur, 15);
      }
    }

    // 2. Claude laten kiezen/voorstellen welke regels nodig zijn.
    const prompt = `Je bent een offerte-assistent voor Wachtelaer, een Belgische verwarmings- en sanitairinstallateur. Een klant vraagt het volgende werk:

Klant: ${klantNaam || '(onbekend)'}
Gevraagd werk: ${omschrijving}

Hieronder staat een lijst van regels uit eerdere offertes van dit bedrijf (elke status — ook niet-aanvaarde offertes bevatten bruikbare, echte prijszetting — al dan niet uitgevoerd, geweigerd, enz., geselecteerd op relevantie voor dit gevraagde werk). Gebruik ze als referentie om realistische offerteregels voor te stellen — kopieer gelijkaardige regels waar mogelijk (zelfde omschrijving/prijs/artikelnummer), en pas aantallen aan op basis van wat logisch is voor het gevraagde werk. Neem het artikelnummer exact over wanneer een regel een bestaand product is; laat het weg bij arbeid/werkuren. Verzin geen onrealistische prijzen of artikelnummers; baseer je zoveel mogelijk op de referentieregels.

Referentieregels (JSON):
${JSON.stringify(referentieRegels)}

Voor arbeid/werkuren: gebruik GEEN generieke "Werkuren"-regel, maar kies per regel de juiste rol (hourtypeCode) uit deze lijst, op basis van wie het werk uitvoert:
${JSON.stringify(hourtypes.map((h) => ({ code: h.code, naam: h.name })))}
Splits arbeid over meerdere regels als verschillende rollen werk uitvoeren (bv. plaatser én technieker). Laat prijs/inkoopprijs/eenheid gerust leeg of 0 voor deze regels — die komen automatisch uit het hourtype zelf, niet uit jouw schatting. Enkel het aantal uren telt.

${
  duurReferentie.length > 0
    ? `Voor het AANTAL uren per rol: baseer je op de werkelijk bestede uren van vergelijkbare, al UITGEVOERDE klussen hieronder (echte historische duur, geen schatting) — kies het aantal van de meest gelijkaardige klus, en pas het enkel aan als de gevraagde klus daar duidelijk van afwijkt (groter/kleiner/complexer):
${JSON.stringify(duurReferentie)}`
    : 'Er is geen vergelijkbare al uitgevoerde klus gevonden in de historiek — schat het aantal uren zelf in op basis van de aard van het gevraagde werk.'
}`;

    const parsed = await vraagClaudeTool(anthropicKey, prompt, 2048, {
      name: 'stel_offerteregels_voor',
      description: 'Stelt offerteregels voor op basis van het gevraagde werk en historische prijszetting.',
      input_schema: {
        type: 'object',
        properties: {
          regels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                omschrijving: { type: 'string' },
                aantal: { type: 'number' },
                eenheid: { type: 'string' },
                prijs: { type: 'number', description: 'Excl. btw, per eenheid' },
                inkoopprijs: { type: 'number', description: 'Kostprijs per eenheid, 0 als arbeid' },
                btw: { type: 'number', description: '21 of 6' },
                materiaalCode: {
                  type: ['string', 'null'],
                  description:
                    'Het artikelnummer (materiaalCode) uit de referentieregels, exact overgenomen als deze regel een bestaand product is. Null bij arbeid/werkuren of iets zonder eigen artikelnummer.',
                },
                hourtypeCode: {
                  type: ['string', 'null'],
                  description:
                    'Voor arbeidsregels: de code van de juiste rol uit de meegegeven hourtypes-lijst (bv. "1" voor plaatser). Null bij materiaal-/productregels. Prijs/inkoopprijs worden voor deze regels genegeerd — enkel aantal telt.',
                },
              },
              required: ['omschrijving', 'aantal', 'eenheid', 'prijs', 'btw'],
            },
          },
          toelichting: { type: 'string', description: 'Max 1 korte zin, Nederlands' },
        },
        required: ['regels', 'toelichting'],
      },
    });
    const voorgesteldeRegels: any[] = Array.isArray(parsed.regels) ? parsed.regels : [];
    if (voorgesteldeRegels.length === 0) throw new Error('De agent stelde geen offerteregels voor');

    // 3. Outsmart-offerteregels opbouwen (totalen zelf berekend, niet
    //    afhankelijk van server-side herberekening — onbevestigd of Outsmart
    //    dat doet).
    const qlnLines = voorgesteldeRegels.map((r, i) => {
      const hourtype = r.hourtypeCode ? hourtypesByCode.get(String(r.hourtypeCode)) : null;
      const aantal = Number(r.aantal) || 1;
      // Werkuren: prijs/inkoopprijs komen altijd uit het hourtype zelf, niet
      // uit Claude's eigen schatting — dat was precies waarom historische
      // "Werkuren"-regels onderling verschillende prijzen hadden.
      const prijs = hourtype ? Number(hourtype.sale_price) || 0 : Number(r.prijs) || 0;
      const inkoopprijs = hourtype ? Number(hourtype.cost_price) || 0 : Number(r.inkoopprijs) || 0;
      const btw = Number(r.btw) || 21;
      const totaalExcl = round2(aantal * prijs);
      const totaalVat = round2(totaalExcl * (btw / 100));
      const omschrijving = hourtype ? hourtype.name : String(r.omschrijving ?? '').slice(0, 500);
      return {
        qln_id: null,
        qln_quo_id: null,
        qln_order: String(i + 1),
        qln_material_code: hourtype ? null : (r.materiaalCode ?? null),
        qln_material_hourtype: hourtype ? hourtype.code : null,
        qln_description: omschrijving,
        // Outsmart vereist minstens één van material_code/hourtype/note per
        // regel — arbeidsregels zonder hourtype (zeldzaam) hebben anders
        // geen van de drie, dus de omschrijving dient ook als note.
        qln_note: omschrijving,
        qln_unit: hourtype ? 'uur' : (r.eenheid ?? ''),
        qln_amount: aantal.toFixed(5),
        qln_price: prijs.toFixed(5),
        purchase_price: inkoopprijs.toFixed(5),
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
      quo_qus_id: resolvedQusId,
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

/** Selecteert de meest relevante rijen voor deze aanvraag — op woord-overlap
 *  met de gevraagde omschrijving, niet blind afgekapt. Bij geen enkele match
 *  (bv. heel generieke vraag) valt terug op de meest recent gebruikte/
 *  uitgevoerde rijen. Generiek herbruikt voor zowel de prijsreferentie als
 *  de duurreferentie (beide hebben een `omschrijving`-veld). */
function kiesRelevanteReferentie(omschrijving: string, alle: any[], max: number): any[] {
  const woorden = (s: string) =>
    new Set((s.toLowerCase().match(/[a-z0-9À-ž]{3,}/g) ?? []));
  const queryWoorden = woorden(omschrijving);

  const gescoord = alle.map((r) => {
    const rWoorden = woorden(r.omschrijving ?? '');
    let score = 0;
    for (const w of queryWoorden) if (rWoorden.has(w)) score++;
    return { r, score };
  });

  gescoord.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.r.laatstGebruikt ?? '').localeCompare(a.r.laatstGebruikt ?? '');
  });

  return gescoord.slice(0, max).map((g) => g.r);
}

/** Meest voorkomende quo_qus_id over een lijst offertes — gebruikt als
 *  bedrijfsbrede terugval wanneer een klant nog geen eigen offerte-
 *  historie heeft om de scheme uit af te leiden. */
function pickMostCommonQusId(quotes: any[]): string | null {
  const freq: Record<string, number> = {};
  for (const q of quotes) {
    if (!q.quo_qus_id) continue;
    const id = String(q.quo_qus_id);
    freq[id] = (freq[id] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of Object.entries(freq)) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
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

/** Dwingt een gestructureerd antwoord af via Anthropic's tool-use (de
 *  assistant-beurt prefillen met "{" wordt door dit model niet ondersteund
 *  — "This model does not support assistant message prefill"). Met
 *  tool_choice vast op één tool krijgen we het antwoord al als geparste
 *  JSON terug (het `input`-veld van het tool_use-blok), geen eigen
 *  tekst-naar-JSON-extractie meer nodig. */
async function vraagClaudeTool(
  anthropicKey: string,
  prompt: string,
  maxTokens: number,
  tool: { name: string; description: string; input_schema: unknown }
): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API-fout (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const body = await res.json();
  const toolUse = (body.content ?? []).find((c: any) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Geen tool-aanroep gevonden in het antwoord van de agent');
  return toolUse.input;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
