// Wachtelaer Veldapp — "Project" dashboard (hidden tab, one account only):
// anchored on ACCEPTED + EXECUTED quotations in Outsmart (the already-
// proven filter from outsmart-offertes) — every dossier starts life as an
// accepted offerte, so that's the source of truth, not "active projects" (a
// project may not exist yet, or may no longer be active, while the offerte
// itself is still the thing to track). EXECUTED is included alongside
// ACCEPTED on explicit request — ACCEPTED alone only covers the last ~5
// months (offertes move to EXECUTED once the job is done, which is most of
// the real history: 447 EXECUTED vs 40 ACCEPTED at time of writing).
//
// Each accepted quotation is then linked to:
//  - its project (werf-fase/periode), if one exists yet
//  - its invoices, via inv_quo_id / quo_worksheet_id+inv_worksheet_id / a
//    textual offerte-number match (see the facturen filter below — inv_quo_id
//    alone covers almost nothing in practice)
//  - its material lines (qln_lines, embedded on the quotation itself)
//
// Linking note: quo_project_id / inv_project_id exist as fields but are NOT
// filterable server-side ("Key X not allowed") and are frequently null in
// the data itself — they can't be trusted as the join key. The reliable
// link Outsmart's own workflow leaves behind is textual: a project's
// `description` reads "Werkbon conform offerte <nummer>", so a project is
// matched to a quotation by that embedded quotation number.
//
// Runs server-side for the same reason as outsmart-offertes: the Outsmart
// tokens are account-wide secrets and must never reach the client bundle.

import { createClient } from 'npm:@supabase/supabase-js@2';

// Matches the HIDDEN_PROJECT_OWNER_ID in app/(tabs)/_layout.tsx — this
// dashboard is a personal scaffold, not yet a team feature.
const ALLOWED_PROFILE_ID = '97793265-0827-49e9-a611-64585da6ccaa';

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
  if (!authHeader) return json({ error: 'Niet aangemeld' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user || user.id !== ALLOWED_PROFILE_ID) {
    return json({ error: 'Geen toegang' }, 403);
  }

  const base = Deno.env.get('OUTSMART_BASE_URL');
  const token = Deno.env.get('OUTSMART_CLIENT_TOKEN');
  const softwareToken = Deno.env.get('OUTSMART_SOFTWARE_TOKEN');
  if (!base || !token || !softwareToken) {
    return json({ error: 'Outsmart-koppeling is niet geconfigureerd (ontbrekende secrets)' }, 500);
  }

  try {
    const [acceptedRes, executedRes, activeProjectsRes, inactiveProjectsRes] = await Promise.all([
      outsmartGet(base, token, softwareToken, 'quotations', {
        key: 'quo_status',
        operator: 'eq',
        value: 'ACCEPTED',
      }),
      outsmartGet(base, token, softwareToken, 'quotations', {
        key: 'quo_status',
        operator: 'eq',
        value: 'EXECUTED',
      }),
      outsmartGet(base, token, softwareToken, 'projects', {
        key: 'active',
        operator: 'eq',
        value: '1',
      }),
      // Een uitgevoerde offerte heeft vaak een project dat niet meer
      // "actief" staat — zonder dit erbij op te halen zou de werf-fase/
      // periode voor afgewerkte dossiers altijd leeg blijven.
      outsmartGet(base, token, softwareToken, 'projects', {
        key: 'active',
        operator: 'eq',
        value: '0',
      }),
    ]);
    const quotaties: any[] = [...(acceptedRes.response ?? []), ...(executedRes.response ?? [])];
    const alleProjecten: any[] = [...(activeProjectsRes.response ?? []), ...(inactiveProjectsRes.response ?? [])];

    const debtorNrs = [...new Set(quotaties.map((q) => q.quo_quotation_debtor_nr).filter(Boolean))];

    const relationByDebtor = new Map<string, any>();
    const invoicesByDebtor = new Map<string, any[]>();
    await Promise.all(
      debtorNrs.map(async (nr) => {
        const [relRes, invRes] = await Promise.all([
          outsmartGet(base, token, softwareToken, 'relations', {
            key: 'debtor_number',
            operator: 'eq',
            value: String(nr),
          }).catch(() => ({ response: [] })),
          outsmartGet(base, token, softwareToken, 'invoices', {
            key: 'inv_invoice_debtor_nr',
            operator: 'eq',
            value: String(nr),
          }).catch(() => ({ response: [] })),
        ]);
        const rel = (relRes.response ?? [])[0];
        if (rel) relationByDebtor.set(nr, rel);
        invoicesByDebtor.set(nr, invRes.response ?? []);
      })
    );

    const dossiers = quotaties.map((q) => {
      const rel = relationByDebtor.get(q.quo_quotation_debtor_nr);
      const adres = rel
        ? [
            [rel.street, rel.house_number].filter(Boolean).join(' '),
            [rel.postal_code, rel.city].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ') || null
        : null;

      // A project's description reads "Werkbon conform offerte <nummer>" —
      // that's the only reliable link back to this quotation.
      const project = alleProjecten.find((p) =>
        (p.description ?? '').includes(q.quo_number_formatted)
      );

      const materialen = (q.qln_lines ?? [])
        .filter((l: any) => l.qln_material_code)
        .map((l: any) => ({
          code: l.qln_material_code,
          omschrijving: l.qln_description,
          aantal: Number(l.qln_amount) || 0,
          eenheid: l.qln_unit || '',
        }));

      // Factuur-koppeling: inv_quo_id (het "voor de hand liggende" veld)
      // staat zo goed als nooit ingevuld (14 van de 5232 facturen, live
      // gecontroleerd) — een koppeling enkel daarop laat bijna elk dossier
      // ten onrechte "nog niet gefactureerd" zien. De betrouwbaarste extra
      // link is quo_worksheet_id/inv_worksheet_id (dezelfde werkbon-id,
      // gedeeld door offerte én factuur — recupereert ~8x meer matches),
      // aangevuld met een tekstuele match op het offertenummer zelf (de
      // factuur-omschrijving/referentie vermeldt die soms rechtstreeks).
      // Facturen die enkel een oud werkbonnummer ("WB-2019-xxxxx") als
      // referentie hebben — de meerderheid van de oudere, vóór dit
      // offerte-systeem aangemaakte facturen — zijn via de API aan geen
      // enkel veld op de offerte te koppelen; die blijven onvermijdelijk
      // als "nog niet gefactureerd" staan, ook al bestaat de factuur wel.
      const invoicesVoorDebtor = invoicesByDebtor.get(q.quo_quotation_debtor_nr) ?? [];
      const facturen = invoicesVoorDebtor
        .filter((i: any) => {
          if (i.inv_quo_id && String(i.inv_quo_id) === String(q.quo_id)) return true;
          if (
            q.quo_worksheet_id &&
            String(q.quo_worksheet_id) !== '0' &&
            i.inv_worksheet_id &&
            String(i.inv_worksheet_id) === String(q.quo_worksheet_id)
          ) {
            return true;
          }
          const ref = String(i.inv_reference || '').trim();
          if (ref && ref === q.quo_number_formatted) return true;
          return String(i.inv_description || '').includes(q.quo_number_formatted);
        })
        .map((i: any) => ({
          nummer: i.inv_number_formatted,
          status: i.inv_status,
          bedrag: i.inv_amount,
          betaaldOp: i.inv_timestamp_payed ?? null,
        }));

      const qnd = q.quotation_debtor;
      const latitude = toCoord(qnd?.qnd_latitude) ?? toCoord(rel?.latitude);
      const longitude = toCoord(qnd?.qnd_longitude) ?? toCoord(rel?.longitude);

      // Marge = omzet excl. btw min inkoopprijs, per offerteregel opgeteld
      // (ook arbeidsuren tellen mee — die hebben geen inkoopprijs, dus
      // leveren volledige marge op, net als in Outsmart zelf).
      const margeEuro = (q.qln_lines ?? []).reduce((som: number, l: any) => {
        const omzet = Number(l.qln_total_excl) || 0;
        const kost = (Number(l.purchase_price) || 0) * (Number(l.qln_amount) || 0);
        return som + (omzet - kost);
      }, 0);
      const offerteBedragExcl = Number(q.quo_amount_excl) || 0;
      const margePercent = offerteBedragExcl > 0 ? (margeEuro / offerteBedragExcl) * 100 : null;

      return {
        id: q.quo_id,
        naam: project ? (project.name ?? '').trim() : '',
        fase: project?.status || null,
        klantNaam: q.quo_quotation_debtor_name || rel?.name || null,
        debtorNr: q.quo_quotation_debtor_nr ?? null,
        adres,
        latitude,
        longitude,
        periodeStart: project?.date_start || null,
        periodeEind: project?.date_end || null,
        offertes: [
          {
            nummer: q.quo_number_formatted,
            status: q.quo_status,
            bedrag: q.quo_amount,
            datumAanvaard: q.quo_timestamp_accepted ?? null,
          },
        ],
        facturen,
        materialen,
        margeEuro,
        margePercent,
      };
    });

    dossiers.sort((a, b) => (b.offertes[0]?.datumAanvaard ?? '').localeCompare(a.offertes[0]?.datumAanvaard ?? ''));

    return json({ dossiers });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Outsmart-aanvraag mislukt' }, 502);
  }
});

/** Outsmart stores "0.000000" for an unset coordinate, not null — treat
 *  that (and anything unparsable) as missing. */
function toCoord(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

async function outsmartGet(
  base: string,
  token: string,
  softwareToken: string,
  path: string,
  params: Record<string, string>
) {
  const url = new URL(`${base}/${path}/`);
  url.searchParams.set('token', token);
  url.searchParams.set('software_token', softwareToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (body.code !== 200) {
    throw new Error(Array.isArray(body.messages) && body.messages.length ? body.messages.join(', ') : `Outsmart-fout (${body.code})`);
  }
  return body;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
