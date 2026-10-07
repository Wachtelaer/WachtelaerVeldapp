// Wachtelaer Veldapp — "Project" dashboard (hidden tab, one account only):
// anchored on ACCEPTED quotations in Outsmart (the already-proven filter
// from outsmart-offertes) — every dossier starts life as an accepted
// offerte, so that's the source of truth, not "active projects" (a project
// may not exist yet, or may no longer be active, while the offerte itself
// is still the thing to track).
//
// Each accepted quotation is then linked to:
//  - its project (werf-fase/periode), if one exists yet
//  - its invoices, via inv_quo_id
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
    const [quotationsRes, projectsRes] = await Promise.all([
      outsmartGet(base, token, softwareToken, 'quotations', {
        key: 'quo_status',
        operator: 'eq',
        value: 'ACCEPTED',
      }),
      outsmartGet(base, token, softwareToken, 'projects', {
        key: 'active',
        operator: 'eq',
        value: '1',
      }),
    ]);
    const quotaties: any[] = quotationsRes.response ?? [];
    const alleActieveProjecten: any[] = projectsRes.response ?? [];

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
      const project = alleActieveProjecten.find((p) =>
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

      const invoicesVoorDebtor = invoicesByDebtor.get(q.quo_quotation_debtor_nr) ?? [];
      const facturen = invoicesVoorDebtor
        .filter((i: any) => i.inv_quo_id === q.quo_id)
        .map((i: any) => ({
          nummer: i.inv_number_formatted,
          status: i.inv_status,
          bedrag: i.inv_amount,
          betaaldOp: i.inv_timestamp_payed ?? null,
        }));

      const qnd = q.quotation_debtor;
      const latitude = toCoord(qnd?.qnd_latitude) ?? toCoord(rel?.latitude);
      const longitude = toCoord(qnd?.qnd_longitude) ?? toCoord(rel?.longitude);

      return {
        id: q.quo_id,
        naam: project ? (project.name ?? '').trim() : '',
        fase: project?.status || null,
        klantNaam: q.quo_quotation_debtor_name || rel?.name || null,
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
