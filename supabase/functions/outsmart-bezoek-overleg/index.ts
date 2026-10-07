// Wachtelaer Veldapp — het stuk van de klantenbezoek-workflow dat de
// gebruiker nog ontbrak: de agent zegt ter plaatse wélke info hij nog nodig
// heeft voor een nauwkeurige offerte, in plaats van meteen te gokken op één
// vrije-tekst omschrijving. Multi-turn: krijgt het hele gesprek tot nu toe
// mee, en antwoordt ofwel met één gerichte vervolgvraag, ofwel dat er genoeg
// info is om de offerte op te stellen (zie outsmart-offerte-aanmaken, dat
// de volledige transcript als omschrijving/context meekrijgt).
//
// Puur tekstueel overleg — maakt zelf niets aan in Outsmart.

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

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return json({ error: 'ANTHROPIC_API_KEY ontbreekt — zet die als Edge Function secret in het Supabase-dashboard.' }, 500);
  }

  let input: { klantNaam?: string; berichten?: Array<{ rol: 'gebruiker' | 'agent'; tekst: string }> };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }
  const klantNaam = (input.klantNaam ?? '').trim();
  const berichten = Array.isArray(input.berichten) ? input.berichten : [];
  if (berichten.length === 0) return json({ error: 'Geen berichten meegestuurd' }, 400);

  const gesprek = berichten
    .map((b) => `${b.rol === 'gebruiker' ? 'Installateur' : 'Agent'}: ${b.tekst}`)
    .join('\n');

  const prompt = `Je bent de offerte-assistent van Wachtelaer, een Belgische verwarmings- en sanitairinstallateur. Een installateur staat TER PLAATSE bij een klant en praat live met jou terwijl hij de situatie opneemt.

Klant: ${klantNaam || '(onbekend)'}

Gesprek tot nu toe:
${gesprek}

Jouw taak: bepaal of je genoeg concrete info hebt om nadien een nauwkeurige offerte op te stellen — denk aan: wat voor werk (installatie/vervanging/herstelling/uitbreiding), type toestel/materiaal, aantallen/afmetingen/diameters waar relevant, bijzonderheden die de prijs beïnvloeden (bereikbaarheid, bestaande leidingen, sloopwerk, etc.). Vraag NIET naar dingen die al gezegd zijn.

- Als er nog iets essentieels ontbreekt: stel ÉÉN korte, concrete vervolgvraag (geen lijst, één vraag per keer, Nederlands).
- Als je genoeg hebt: zeg dat je klaar bent en geef een korte samenvatting (max 2 zinnen) van wat je hebt opgevangen.

Antwoord UITSLUITEND met geldige JSON, exact in dit formaat, zonder uitleg erbuiten:
{"status": "vraag" | "klaar", "tekst": "<je vervolgvraag, of je samenvatting als je klaar bent>"}`;

  try {
    const parsed = await vraagClaudeJson(anthropicKey, prompt, 512);
    const status = parsed.status === 'klaar' ? 'klaar' : 'vraag';
    return json({ status, tekst: String(parsed.tekst ?? '') });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Overleg met de agent mislukt' }, 502);
  }
});

/** Vraagt Claude om JSON en maakt dat ook afdwingbaar: de assistant-beurt
 *  wordt geprefilld met "{" (Anthropic's eigen techniek om vrije tekst
 *  rond het antwoord te vermijden), in plaats van enkel op een regex te
 *  vertrouwen om JSON uit vrije tekst te vissen — die faalde zodra Claude
 *  iets anders dan pure JSON terugstuurde (precies de fout die hier
 *  gemeld werd). */
async function vraagClaudeJson(anthropicKey: string, prompt: string, maxTokens: number): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
