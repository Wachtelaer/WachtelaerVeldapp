// Wachtelaer Veldapp — "Project" dashboard (hidden tab, one account only):
// pulls Outsmart "projects" (= job dossiers), joins their quotation and
// invoice rows, to give a per-dossier pipeline view (offerte -> werf-fase ->
// facturatie). Only the resources confirmed to exist on the current Outsmart
// tokens are used — a dedicated "bestelling"/"werkbon" resource was not
// found (see commit history); this covers 3 of the 6 requested stages.
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
    const projectsRes = await outsmartGet(base, token, softwareToken, 'projects', {
      key: 'active',
      operator: 'eq',
      value: '1',
    });
    const projecten: any[] = projectsRes.response ?? [];

    const debtorNrs = [...new Set(projecten.map((p) => p.debtor_number).filter(Boolean))];
    const relationByDebtor = new Map<string, any>();
    await Promise.all(
      debtorNrs.map(async (nr) => {
        try {
          const res = await outsmartGet(base, token, softwareToken, 'relations', {
            key: 'debtor_number',
            operator: 'eq',
            value: String(nr),
          });
          const rel = (res.response ?? [])[0];
          if (rel) relationByDebtor.set(nr, rel);
        } catch {
          // best-effort, same as outsmart-offertes
        }
      })
    );

    const dossiers = await Promise.all(
      projecten.map(async (p) => {
        const [quoRes, invRes] = await Promise.all([
          outsmartGet(base, token, softwareToken, 'quotations', {
            key: 'quo_project_id',
            operator: 'eq',
            value: String(p.id),
          }).catch(() => ({ response: [] })),
          outsmartGet(base, token, softwareToken, 'invoices', {
            key: 'inv_project_id',
            operator: 'eq',
            value: String(p.id),
          }).catch(() => ({ response: [] })),
        ]);

        const rel = relationByDebtor.get(p.debtor_number);
        const adres = rel
          ? [
              [rel.street, rel.house_number].filter(Boolean).join(' '),
              [rel.postal_code, rel.city].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ') || null
          : null;

        const offertes = (quoRes.response ?? []).map((q: any) => ({
          nummer: q.quo_number_formatted,
          status: q.quo_status,
          bedrag: q.quo_amount,
          datumAanvaard: q.quo_timestamp_accepted ?? null,
        }));

        const facturen = (invRes.response ?? []).map((i: any) => ({
          nummer: i.inv_number_formatted,
          status: i.inv_status,
          bedrag: i.inv_amount,
          betaaldOp: i.inv_timestamp_payed ?? null,
        }));

        return {
          id: p.id,
          naam: (p.name ?? '').trim(),
          fase: p.status || null,
          klantNaam: rel?.name ?? null,
          adres,
          periodeStart: p.date_start || null,
          periodeEind: p.date_end || null,
          offertes,
          facturen,
        };
      })
    );

    return json({ dossiers });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Outsmart-aanvraag mislukt' }, 502);
  }
});

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
