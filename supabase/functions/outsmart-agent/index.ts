// Wachtelaer Veldapp — de eigenlijke "AI agent" voor het Project-dashboard:
// krijgt de al opgehaalde Outsmart-dossiers (van outsmart-pipeline) mee en
// vraagt Claude om per dossier een prioriteit + advies, plus
// bedrijfsbrede aandachtspunten. Puur tekstueel advies — voert zelf nooit
// iets uit in Outsmart of elders.
//
// Vereist de ANTHROPIC_API_KEY edge function secret (Supabase Dashboard →
// Project Settings → Edge Functions → Secrets) — niet iets dat deze
// functie zelf kan instellen.

import { createClient } from 'npm:@supabase/supabase-js@2';

// Matches the HIDDEN_PROJECT_OWNER_ID in app/(tabs)/_layout.tsx.
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

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return json({ error: 'ANTHROPIC_API_KEY ontbreekt — zet die als Edge Function secret in het Supabase-dashboard.' }, 500);
  }

  let dossiers: any[];
  try {
    const body = await req.json();
    dossiers = Array.isArray(body?.dossiers) ? body.dossiers : [];
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }
  if (dossiers.length === 0) {
    return json({ adviezen: [], aandachtspunten: [] });
  }

  const compact = dossiers.map((d) => ({
    id: d.id,
    klant: d.klantNaam || d.naam || null,
    fase: d.fase,
    offerteBedrag: d.offertes?.[0]?.bedrag ?? null,
    offerteAanvaardOp: d.offertes?.[0]?.datumAanvaard ?? null,
    periodeStart: d.periodeStart,
    periodeEind: d.periodeEind,
    aantalMaterialen: (d.materialen ?? []).length,
    aantalFacturen: (d.facturen ?? []).length,
    factuurTotaal: (d.facturen ?? []).reduce((s: number, f: any) => s + (Number(f.bedrag) || 0), 0),
    factuurStatussen: (d.facturen ?? []).map((f: any) => f.status),
  }));

  const vandaag = new Date().toISOString().slice(0, 10);
  const prompt = `Je bent een planningsassistent voor Wachtelaer, een Belgische verwarmings- en sanitairinstallateur. Vandaag is ${vandaag}.

Hieronder staat een lijst van actieve dossiers (elk gestart als een aanvaarde offerte in Outsmart, met eventueel al een werf-fase en facturen). Geef voor elk dossier een prioriteit en een kort, concreet advies voor de eerstvolgende actie — denk aan: nog geen opmeting terwijl de uitvoering nadert, lang geleden aanvaard maar nog geen werf, werf afgewerkt maar nog niet gefactureerd, factuur al lang open, een ongewoon grote nacalculatie-afwijking, enz. Baseer je enkel op de gegeven data, verzin niets.

Dossiers (JSON):
${JSON.stringify(compact)}

Antwoord UITSLUITEND met geldige JSON, exact in dit formaat, zonder uitleg errbuiten:
{"adviezen": [{"id": "<dossier id>", "prioriteit": "hoog" | "normaal" | "laag", "advies": "<max 1 korte zin, Nederlands>"}], "aandachtspunten": ["<max 3 algemene, bedrijfsbrede observaties over de hele lijst samen, Nederlands>"]}`;

  try {
    const parsed = await vraagClaudeTool(anthropicKey, prompt, 2048, {
      name: 'geef_advies',
      description: 'Rapporteert prioriteit + advies per dossier, plus bedrijfsbrede aandachtspunten.',
      input_schema: {
        type: 'object',
        properties: {
          adviezen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                prioriteit: { type: 'string', enum: ['hoog', 'normaal', 'laag'] },
                advies: { type: 'string' },
              },
              required: ['id', 'prioriteit', 'advies'],
            },
          },
          aandachtspunten: { type: 'array', items: { type: 'string' } },
        },
        required: ['adviezen', 'aandachtspunten'],
      },
    });

    return json({
      adviezen: Array.isArray(parsed.adviezen) ? parsed.adviezen : [],
      aandachtspunten: Array.isArray(parsed.aandachtspunten) ? parsed.aandachtspunten : [],
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Agent-aanvraag mislukt' }, 502);
  }
});

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
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
