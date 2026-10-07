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
    const parsed = await vraagClaudeJson(anthropicKey, prompt, 2048);

    return json({
      adviezen: Array.isArray(parsed.adviezen) ? parsed.adviezen : [],
      aandachtspunten: Array.isArray(parsed.aandachtspunten) ? parsed.aandachtspunten : [],
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Agent-aanvraag mislukt' }, 502);
  }
});

/** Vraagt Claude om JSON en maakt dat ook afdwingbaar: de assistant-beurt
 *  wordt geprefilld met "{" (Anthropic's eigen techniek om vrije tekst
 *  rond het antwoord te vermijden), in plaats van enkel op een regex te
 *  vertrouwen om JSON uit vrije tekst te vissen — die faalde zodra Claude
 *  iets anders dan pure JSON terugstuurde. */
async function vraagClaudeJson(anthropicKey: string, prompt: string, maxTokens: number): Promise<any> {
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
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API-fout (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const body = await res.json();
  const continuation: string = body.content?.[0]?.text ?? '';
  const fullText = '{' + continuation;
  try {
    return JSON.parse(fullText);
  } catch {
    const lastBrace = fullText.lastIndexOf('}');
    if (lastBrace === -1) throw new Error(`Kon het antwoord van de agent niet als JSON lezen: ${fullText.slice(0, 300)}`);
    try {
      return JSON.parse(fullText.slice(0, lastBrace + 1));
    } catch {
      throw new Error(`Kon het antwoord van de agent niet als JSON lezen: ${fullText.slice(0, 300)}`);
    }
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
