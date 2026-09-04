// Wachtelaer Veldapp — pulls approved ("ACCEPTED") quotations from Outsmart
// for the Planning tab (management, sales, werfleiding).
//
// Runs server-side: the Outsmart client/software tokens are long-lived
// account-wide secrets and must never ship inside the app bundle. The app
// calls this function with the caller's own session token; the function
// checks the caller's role, then uses the Outsmart secrets internally.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ROLES = ['mgmt', 'sales', 'werfleider'];

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
  if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
    return json({ error: 'Geen toegang tot Planning' }, 403);
  }

  const base = Deno.env.get('OUTSMART_BASE_URL');
  const token = Deno.env.get('OUTSMART_CLIENT_TOKEN');
  const softwareToken = Deno.env.get('OUTSMART_SOFTWARE_TOKEN');
  if (!base || !token || !softwareToken) {
    return json({ error: 'Outsmart-koppeling is niet geconfigureerd (ontbrekende secrets)' }, 500);
  }

  try {
    const quotationsRes = await outsmartGet(base, token, softwareToken, 'quotations', {
      key: 'quo_status',
      operator: 'eq',
      value: 'ACCEPTED',
    });
    const quotaties: any[] = quotationsRes.response ?? [];

    // One relation lookup per distinct debiteur, in parallel, to attach an
    // address — a missing/failed lookup just leaves that offerte's adres
    // blank instead of failing the whole list.
    const debtorNrs = [...new Set(quotaties.map((q) => q.quo_quotation_debtor_nr).filter(Boolean))];
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
          // best-effort — see comment above
        }
      })
    );

    const offertes = quotaties.map((q) => {
      const rel = relationByDebtor.get(q.quo_quotation_debtor_nr);
      const adres = rel
        ? [
            [rel.street, rel.house_number].filter(Boolean).join(' '),
            [rel.postal_code, rel.city].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ') || null
        : null;

      return {
        id: q.quo_id,
        nummer: q.quo_number_formatted,
        klantNaam: q.quo_quotation_debtor_name,
        adres,
        omschrijving: q.quo_description || q.quo_reference || '',
        bedrag: q.quo_amount,
        datumAanvaard: q.quo_timestamp_accepted,
        substatus: q.quo_substatus,
      };
    });

    offertes.sort((a, b) => (b.datumAanvaard ?? '').localeCompare(a.datumAanvaard ?? ''));

    return json({ offertes });
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
