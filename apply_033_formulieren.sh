#!/usr/bin/env bash
set -euo pipefail

echo "Wachtelaer Veldapp - Formulieren module + per-klant/per-werf backupmappen toepassen..."

mkdir -p "supabase/migrations"
cat > "supabase/migrations/0014_formulieren.sql" <<'WACHTELAER_EOF_MARKER'
-- Wachtelaer Veldapp — Formulieren: standalone service forms (onderhoud,
-- recuperatie, druktest, opstart) available to everyone, not tied to a
-- werf or an opportunity. Modeled closely on opmetingen (0004) since the
-- shape — invuller, klantgegevens, jsonb antwoorden, optional photos — is
-- identical; the only real difference is who's allowed to create one.

create table formulieren (
  id uuid primary key default gen_random_uuid(),
  invuller_id uuid not null references profiles (id),
  formulier text not null check (
    formulier in ('onderhoud_airco', 'onderhoud_ventilatie', 'recuperatie_koelmiddel', 'druktest_leidingen', 'opstart_airco')
  ),
  klant_naam text not null default '',
  klant_adres text not null default '',
  klant_tel text not null default '',
  antwoorden jsonb not null default '{}'::jsonb,
  nota text not null default '',
  created_at timestamptz not null default now()
);

alter table formulieren enable row level security;

create policy "formulieren are readable by their invuller and management"
  on formulieren for select
  to authenticated
  using (invuller_id = auth.uid() or private.is_mgmt(auth.uid()));

create policy "formulieren are created by their own invuller"
  on formulieren for insert
  to authenticated
  with check (invuller_id = auth.uid());

create table formulier_fotos (
  id uuid primary key default gen_random_uuid(),
  formulier_id uuid not null references formulieren (id) on delete cascade,
  storage_path text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table formulier_fotos enable row level security;

create function private.can_view_formulier(target_formulier uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from formulieren f
    where f.id = target_formulier
      and (f.invuller_id = uid or private.is_mgmt(uid))
  );
$$;

create policy "formulier_fotos follow the formulier's visibility"
  on formulier_fotos for select
  to authenticated
  using (private.can_view_formulier(formulier_id, auth.uid()));

create policy "formulier_fotos are added by the formulier's own invuller"
  on formulier_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from formulieren f
      where f.id = formulier_id and f.invuller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- storage — formulier photos, one object per photo at {formulier_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('formulier-fotos', 'formulier-fotos', false)
on conflict (id) do nothing;

create policy "formulier photos are readable per formulier visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'formulier-fotos'
    and private.can_view_formulier(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "formulier photos are uploaded by the formulier's own invuller"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'formulier-fotos'
    and exists (
      select 1 from formulieren f
      where f.id = ((storage.foldername(name))[1])::uuid and f.invuller_id = auth.uid()
    )
  );
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/salesModules.ts" <<'WACHTELAER_EOF_MARKER'
// Ported from the MODULES config in project/Wachtelaer Veldapp.dc.html —
// one short questionnaire per domain, capturing only what the backoffice
// needs to build a quote. Deliberately no prices: the verkoper measures,
// the backoffice quotes.

export type ModuleKey = 'verwarming' | 'airco' | 'zon' | 'sanitair' | 'ventilatie';
export type VeldKind = 'keuze' | 'num' | 'getal' | 'tekst' | 'chips' | 'lijst' | 'datum';

export interface SalesVeld {
  id: string;
  label: string;
  kind: VeldKind;
  opties?: string[];
  eenheid?: string;
  stap?: number;
  ph?: string;
  hintTekst?: string;
  /** For kind 'lijst': id of the field whose numeric value decides how
   *  many inputs to render (e.g. one per room, driven by "aantal ruimtes"). */
  telVeldId?: string;
}

export interface SalesModule {
  key: ModuleKey;
  naam: string;
  sub: string;
  fotoTip: string;
  velden: SalesVeld[];
}

export const SALES_MODULES: SalesModule[] = [
  {
    key: 'verwarming',
    naam: 'Verwarming',
    sub: 'Ketel, warmtepomp, radiatoren, vloerverwarming',
    fotoTip: "Foto's van ketel + typeplaatje, schouw/afvoer, stookplaats en zekeringkast.",
    velden: [
      { id: 'type', label: 'Gewenste oplossing', kind: 'keuze', opties: ['Condensatieketel gas', 'Condensatieketel stookolie', 'Warmtepomp lucht/water', 'Hybride', 'Nog te bepalen'] },
      { id: 'huidig', label: 'Huidige installatie', kind: 'keuze', opties: ['Gas', 'Stookolie', 'Elektrisch', 'Geen'] },
      { id: 'leeftijd', label: 'Leeftijd toestel', kind: 'getal', eenheid: 'jaar' },
      { id: 'opp', label: 'Te verwarmen oppervlakte', kind: 'getal', eenheid: 'm²' },
      { id: 'afgifte', label: 'Afgifte aanwezig', kind: 'chips', opties: ['Radiatoren', 'Vloerverwarming', 'Convectoren', 'Nieuw te plaatsen'] },
      { id: 'ww', label: 'Warm water', kind: 'keuze', opties: ['Via ketel', 'Boiler 150L', 'Boiler 200L+', 'Apart toestel'] },
      { id: 'epc', label: 'Isolatie / EPC', kind: 'tekst', ph: 'EPC-label of bouwjaar + isolatie', hintTekst: 'Nodig voor de warmteverliesberekening in de backoffice.' },
      { id: 'schouw', label: 'Afvoer / schouw', kind: 'keuze', opties: ['Bestaande schouw', 'Dakdoorvoer nodig', 'Muurdoorvoer', 'Tubering', 'Onbekend'] },
      { id: 'schouwlengte', label: 'Lengte schouw', kind: 'getal', eenheid: 'm' },
    ],
  },
  {
    key: 'airco',
    naam: 'Airco',
    sub: 'Split, multisplit, cassette',
    fotoTip: 'Foto per ruimte, plaats buitenunit, leidingtracé en condensafvoer.',
    velden: [
      { id: 'ruimtes', label: 'Aantal ruimtes', kind: 'getal', eenheid: 'ruimtes' },
      { id: 'opp', label: 'Oppervlakte per ruimte', kind: 'lijst', telVeldId: 'ruimtes', eenheid: 'm²' },
      { id: 'binnen', label: 'Type binnenunit', kind: 'chips', opties: ['Wandmodel', 'Cassette', 'Vloermodel', 'Kanaalunit'] },
      { id: 'buiten', label: 'Plaats buitenunit', kind: 'keuze', opties: ['Tuin', 'Plat dak', 'Muurbeugel', 'Nog te bekijken'] },
      { id: 'leiding', label: 'Leidinglengte per binnenunit', kind: 'tekst', ph: 'bv. living 8m, slaapkamer 1 12m', hintTekst: 'Eén lengte per ruimte/binnenunit.' },
      { id: 'voeding', label: 'Elektrische voeding', kind: 'keuze', opties: ['Vrije zekering', 'Nieuwe kring nodig', 'Onbekend'] },
      { id: 'condens', label: 'Condensafvoer', kind: 'keuze', opties: ['Naar afvoer', 'Pomp nodig', 'Naar buiten'] },
      { id: 'koelverwarm', label: 'Ook verwarmen?', kind: 'keuze', opties: ['Ja', 'Nee'] },
    ],
  },
  {
    key: 'zon',
    naam: 'Zonnepanelen + batterij',
    sub: 'Dak, omvormer, thuisbatterij',
    fotoTip: 'Dak van buiten (elke zijde), zolder/dakstructuur, zekeringkast en digitale meter.',
    velden: [
      { id: 'dakopp', label: 'Beschikbaar dakoppervlak', kind: 'getal', eenheid: 'm²' },
      { id: 'orient', label: 'Oriëntatie', kind: 'chips', opties: ['Zuid', 'Oost', 'West', 'Noord', 'Plat dak'] },
      { id: 'dakbed', label: 'Dakbedekking', kind: 'keuze', opties: ['Pannen', 'Leien', 'Roofing', 'Golfplaat', 'EPDM'] },
      { id: 'helling', label: 'Dakhelling', kind: 'getal', eenheid: 'graden' },
      { id: 'verbruik', label: 'Jaarverbruik', kind: 'getal', eenheid: 'kWh' },
      { id: 'batterij', label: 'Batterij gewenst', kind: 'keuze', opties: ['Nee', '7 kWh', '14 kWh', '21 kWh', 'Advies vragen'] },
      { id: 'meter', label: 'Digitale meter', kind: 'keuze', opties: ['Ja', 'Nee', 'Onbekend'] },
      { id: 'ean', label: 'EAN-nummer', kind: 'tekst', ph: '54144…', hintTekst: 'Overnemen van de meterkast — anders kan de aanvraag bij Fluvius niet mee.' },
      { id: 'steiger', label: 'Steiger of hoogtewerker', kind: 'keuze', opties: ['Nodig', 'Niet nodig', 'Te bekijken'] },
    ],
  },
  {
    key: 'sanitair',
    naam: 'Sanitair',
    sub: 'Badkamer, toestellen, leidingwerk',
    fotoTip: 'Elke wand van de ruimte, bestaande leidingen, teller en afvoerpunten.',
    velden: [
      { id: 'ruimte', label: 'Wat wordt aangepakt', kind: 'chips', opties: ['Badkamer', 'Tweede badkamer', 'Toilet', 'Keuken', 'Berging'] },
      { id: 'toestellen', label: 'Toestellen', kind: 'chips', opties: ['Bad', 'Inloopdouche', 'Douchecabine', 'Lavabo', 'Dubbele lavabo', 'Hangtoilet'] },
      { id: 'leidingen', label: 'Leidingwerk', kind: 'keuze', opties: ['Volledig vernieuwen', 'Gedeeltelijk', 'Behouden'] },
      { id: 'tegels', label: 'Tegelwerk door', kind: 'keuze', opties: ['Wachtelaer', 'Klant zelf', 'Andere aannemer'] },
      { id: 'ww', label: 'Warm water', kind: 'keuze', opties: ['Bestaand toestel', 'Nieuwe boiler', 'Doorstromer'] },
      { id: 'afvoer', label: 'Afvoer aanwezig', kind: 'keuze', opties: ['Ja, bruikbaar', 'Verplaatsen', 'Nieuw te maken'] },
      { id: 'timing', label: 'Gewenste timing', kind: 'tekst', ph: 'bv. na bouwvak, klant is flexibel' },
    ],
  },
  {
    key: 'ventilatie',
    naam: 'Ventilatie',
    sub: 'Systeem C of D, kanalen, unit',
    fotoTip: 'Plaats van de unit, valse plafonds of technische schacht, doorvoeren dak of muur.',
    velden: [
      { id: 'systeem', label: 'Systeem', kind: 'keuze', opties: ['C+ (vraaggestuurd)', 'D met WTW', 'Advies vragen'] },
      { id: 'ruimtes', label: 'Aantal ruimtes aan te sluiten', kind: 'getal', eenheid: 'ruimtes' },
      { id: 'opp', label: 'Bewoonbare oppervlakte', kind: 'getal', eenheid: 'm²' },
      { id: 'unit', label: 'Plaats unit', kind: 'keuze', opties: ['Zolder', 'Technische ruimte', 'Berging', 'Te bepalen'] },
      { id: 'kanalen', label: 'Kanalen', kind: 'keuze', opties: ['Valse plafonds', 'Zichtbaar', 'In vloer', 'Mix'] },
      { id: 'bouw', label: 'Situatie', kind: 'keuze', opties: ['Nieuwbouw', 'Renovatie', 'Bewoond huis'] },
      { id: 'doorvoer', label: 'Doorvoer', kind: 'keuze', opties: ['Dak', 'Muur', 'Bestaand'] },
    ],
  },
];

export function getModule(key: string): SalesModule {
  return SALES_MODULES.find((m) => m.key === key) ?? SALES_MODULES[0];
}

/** Any "has a list of velden" config — SalesModule and FormTemplate both qualify. */
export interface VeldHouder {
  velden: SalesVeld[];
}

/** Which fields are still empty, in the same order as the module's questionnaire. */
export function missingVelden(mod: VeldHouder, antwoorden: Record<string, unknown>): string[] {
  return mod.velden
    .filter((v) => {
      const w = antwoorden[v.id];
      if (v.kind === 'chips') return !(Array.isArray(w) && w.length);
      if (v.kind === 'lijst') {
        const aantal = Math.max(0, Math.floor(Number(antwoorden[v.telVeldId ?? '']) || 0));
        if (aantal === 0) return false; // nothing to fill in until the count is set
        const arr = Array.isArray(w) ? (w as string[]) : [];
        return arr.length < aantal || arr.slice(0, aantal).some((x) => !x);
      }
      return !w;
    })
    .map((v) => v.label.toLowerCase());
}

/** A short "N m² zuid · 10 kWh batterij"-style summary for list rows. */
export function summarizeAntwoorden(mod: SalesModule, antwoorden: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const v of mod.velden) {
    if (parts.length >= 2) break;
    const w = antwoorden[v.id];
    if (v.kind === 'chips' && Array.isArray(w) && w.length) parts.push(w.join(', '));
    else if (v.kind === 'lijst' && Array.isArray(w) && w.length) {
      parts.push(`${w.filter(Boolean).join(', ')} ${v.eenheid ?? ''}`.trim());
    } else if ((v.kind === 'num' || v.kind === 'getal') && w) parts.push(`${w} ${v.eenheid ?? ''}`.trim());
    else if ((v.kind === 'keuze' || v.kind === 'tekst') && w) parts.push(String(w));
  }
  return parts.length ? parts.join(' · ') : mod.sub;
}
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/formTemplates.ts" <<'WACHTELAER_EOF_MARKER'
// Standalone forms available to everyone under Meer → Formulieren — unlike
// the sales opmetingen, these aren't tied to a quote/opportunity, just a
// filled-in service record for a customer. Reuses the same field-kind
// system as lib/salesModules.ts (SalesVeld/VeldKind) since the shape of
// "a short questionnaire with typed fields" is identical.

import type { SalesVeld } from '@/lib/salesModules';

export type FormKey =
  | 'onderhoud_airco'
  | 'onderhoud_ventilatie'
  | 'recuperatie_koelmiddel'
  | 'druktest_leidingen'
  | 'opstart_airco';

export interface FormTemplate {
  key: FormKey;
  naam: string;
  sub: string;
  velden: SalesVeld[];
}

const JA_NEE = ['Ja', 'Nee'];
const KOELMIDDEL_OPTIES = ['R32', 'R410A', 'R290', 'R134a', 'Ander'];

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: 'onderhoud_airco',
    naam: 'Onderhoud airco',
    sub: 'Jaarlijks onderhoud van een airco-installatie',
    velden: [
      { id: 'merk_model', label: 'Merk/model', kind: 'tekst' },
      { id: 'serienummer', label: 'Serienummer', kind: 'tekst' },
      { id: 'koelmiddel', label: 'Koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'druk', label: 'Gemeten druk', kind: 'getal', eenheid: 'bar' },
      { id: 'filters', label: 'Filters', kind: 'keuze', opties: ['Gereinigd', 'Vervangen', 'N.v.t.'] },
      { id: 'buitenunit', label: 'Buitenunit gereinigd', kind: 'keuze', opties: JA_NEE },
      { id: 'binnenunit', label: 'Binnenunit gereinigd', kind: 'keuze', opties: JA_NEE },
      { id: 'afvoer', label: 'Afvoer gecontroleerd', kind: 'keuze', opties: JA_NEE },
      { id: 'elektrisch', label: 'Elektrische aansluitingen gecontroleerd', kind: 'keuze', opties: JA_NEE },
      { id: 'werking', label: 'Werking getest', kind: 'keuze', opties: ['Goed', 'Gebrek'] },
      { id: 'gebreken', label: 'Vastgestelde gebreken', kind: 'tekst', ph: 'Optioneel' },
      { id: 'volgend_onderhoud', label: 'Volgend onderhoud', kind: 'datum' },
    ],
  },
  {
    key: 'onderhoud_ventilatie',
    naam: 'Onderhoud ventilatie',
    sub: 'Jaarlijks onderhoud van een ventilatiesysteem',
    velden: [
      { id: 'systeem', label: 'Type systeem', kind: 'keuze', opties: ['WTW', 'Natuurlijke ventilatie', 'Mechanische afvoer', 'Balansventilatie'] },
      { id: 'filters', label: 'Filters', kind: 'keuze', opties: ['Gereinigd', 'Vervangen', 'N.v.t.'] },
      { id: 'ventilatoren', label: 'Ventilatoren gecontroleerd', kind: 'keuze', opties: JA_NEE },
      { id: 'kanalen', label: 'Kanalen gereinigd', kind: 'keuze', opties: ['Ja', 'Nee', 'N.v.t.'] },
      { id: 'debiet', label: 'Debiet gemeten', kind: 'getal', eenheid: 'm³/h' },
      { id: 'geluid', label: 'Abnormaal geluid', kind: 'keuze', opties: JA_NEE },
      { id: 'gebreken', label: 'Vastgestelde gebreken', kind: 'tekst', ph: 'Optioneel' },
      { id: 'volgend_onderhoud', label: 'Volgend onderhoud', kind: 'datum' },
    ],
  },
  {
    key: 'recuperatie_koelmiddel',
    naam: 'Recuperatie koelmiddel',
    sub: 'Registratie van gerecupereerd koelmiddel',
    velden: [
      { id: 'koelmiddel', label: 'Koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'hoeveelheid', label: 'Hoeveelheid gerecupereerd', kind: 'getal', eenheid: 'kg' },
      { id: 'herkomst', label: 'Herkomst / toestel', kind: 'tekst' },
      { id: 'reden', label: 'Reden', kind: 'keuze', opties: ['Lek', 'Vervanging toestel', 'Einde levensduur', 'Onderhoud', 'Ander'] },
      { id: 'cilindernummer', label: 'Cilindernummer', kind: 'tekst' },
      { id: 'certificaat', label: 'Technicus-certificaatnummer', kind: 'tekst' },
      { id: 'lekdetectie', label: 'Lekdetectie uitgevoerd', kind: 'keuze', opties: JA_NEE },
    ],
  },
  {
    key: 'druktest_leidingen',
    naam: 'Druktest leidingen',
    sub: 'Druktest van sanitaire of verwarmingsleidingen',
    velden: [
      { id: 'type_leiding', label: 'Type leiding', kind: 'keuze', opties: ['Sanitair', 'Verwarming', 'Beide'] },
      { id: 'medium', label: 'Testmedium', kind: 'keuze', opties: ['Water', 'Lucht'] },
      { id: 'testdruk', label: 'Testdruk', kind: 'getal', eenheid: 'bar' },
      { id: 'testduur', label: 'Testduur', kind: 'getal', eenheid: 'minuten' },
      { id: 'resultaat', label: 'Resultaat', kind: 'keuze', opties: ['Geslaagd', 'Gefaald'] },
      { id: 'lek_locatie', label: 'Locatie lek (indien gefaald)', kind: 'tekst', ph: 'Optioneel' },
      { id: 'manometer', label: 'Gebruikte manometer', kind: 'tekst' },
    ],
  },
  {
    key: 'opstart_airco',
    naam: 'Opstart airco',
    sub: 'Indienststelling van een nieuwe airco-installatie',
    velden: [
      { id: 'merk_model', label: 'Merk/model binnen- en buitenunit', kind: 'tekst' },
      { id: 'serienummers', label: 'Serienummers', kind: 'tekst' },
      { id: 'koelmiddel', label: 'Koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'fabrieksvulling', label: 'Fabrieksvulling', kind: 'getal', eenheid: 'kg' },
      { id: 'bijgevuld', label: 'Bijgevulde hoeveelheid', kind: 'getal', eenheid: 'kg' },
      { id: 'elektrisch', label: 'Elektrische voeding gecontroleerd', kind: 'keuze', opties: JA_NEE },
      { id: 'vacuum', label: 'Vacuümtest uitgevoerd', kind: 'keuze', opties: JA_NEE },
      { id: 'werkdruk', label: 'Werkdruk gemeten', kind: 'getal', eenheid: 'bar' },
      { id: 'werking', label: 'Werking getest', kind: 'keuze', opties: ['Goed', 'Gebrek'] },
      { id: 'uitleg', label: 'Uitleg gegeven aan klant', kind: 'keuze', opties: JA_NEE },
    ],
  },
];

export function getFormTemplate(key: string): FormTemplate {
  return FORM_TEMPLATES.find((f) => f.key === key) ?? FORM_TEMPLATES[0];
}
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/database.types.ts" <<'WACHTELAER_EOF_MARKER'
// Hand-written to match supabase/migrations/0001_werfrapporten.sql.
// Regenerate with `supabase gen types typescript` once the schema grows.

export type Role = 'tech' | 'werfleider' | 'sales' | 'mgmt' | 'magazijnier';
export type Weer = 'Droog' | 'Regen' | 'Hitte';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  verlof_dagen: number;
  inhaalrust_dagen: number;
  created_at: string;
}

export interface Werf {
  id: string;
  code: string;
  naam: string;
  adres: string;
  fase: string;
  is_algemeen: boolean;
  created_at: string;
}

export interface WerfMember {
  werf_id: string;
  profile_id: string;
  is_leider: boolean;
}

export interface Werfrapport {
  id: string;
  werf_id: string;
  auteur_id: string;
  datum: string;
  weer: Weer;
  aanwezig_eigen: number;
  aanwezig_onderaanneming: number;
  uitgevoerd: string;
  knelpunt: string;
  deel_mgmt: boolean;
  deel_werf: boolean;
  deel_klant: boolean;
  created_at: string;
}

export interface WerfrapportFoto {
  id: string;
  rapport_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export interface WerfrapportReactie {
  id: string;
  rapport_id: string;
  auteur_id: string;
  tekst: string;
  created_at: string;
}

export interface WerfChatBericht {
  id: string;
  werf_id: string;
  auteur_id: string;
  tekst: string;
  foto_storage_path: string | null;
  created_at: string;
}

export interface WerfChatRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface Opmeting {
  id: string;
  verkoper_id: string;
  module: string;
  klant_naam: string;
  klant_adres: string;
  klant_tel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  status: string;
  created_at: string;
}

export interface OpmetingFoto {
  id: string;
  opmeting_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export type VerlofType = 'Verlof' | 'Inhaalrust' | 'Ziekte';
export type VerlofStatus = 'wacht' | 'goed' | 'nee';

export interface Verlofaanvraag {
  id: string;
  aanvrager_id: string;
  type: VerlofType;
  van: string;
  tot: string;
  nota: string;
  status: VerlofStatus;
  behandeld_door: string | null;
  behandeld_op: string | null;
  created_at: string;
}

export interface PlanDocument {
  id: string;
  werf_id: string;
  titel: string;
  created_at: string;
}

export interface PlanVersie {
  id: string;
  document_id: string;
  versie_nummer: number;
  storage_path: string;
  bestandsnaam: string;
  geupload_door: string;
  created_at: string;
}

export interface PlanRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface Formulier {
  id: string;
  invuller_id: string;
  formulier: string;
  klant_naam: string;
  klant_adres: string;
  klant_tel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  created_at: string;
}

export interface FormulierFoto {
  id: string;
  formulier_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export interface MagazijnMelding {
  id: string;
  melder_id: string;
  werf_id: string | null;
  tekst: string;
  hoeveelheid: number | null;
  eenheid: string;
  verwerkt: boolean;
  verwerkt_door: string | null;
  verwerkt_op: string | null;
  created_at: string;
}

export interface MagazijnMeldingFoto {
  id: string;
  melding_id: string;
  storage_path: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'role'>; Update: Partial<Profile> };
      werven: { Row: Werf; Insert: Partial<Werf> & Pick<Werf, 'code' | 'naam' | 'adres'>; Update: Partial<Werf> };
      werf_members: { Row: WerfMember; Insert: WerfMember; Update: Partial<WerfMember> };
      werfrapporten: {
        Row: Werfrapport;
        Insert: Partial<Werfrapport> & Pick<Werfrapport, 'werf_id' | 'auteur_id' | 'weer'>;
        Update: Partial<Werfrapport>;
      };
      werfrapport_fotos: {
        Row: WerfrapportFoto;
        Insert: Partial<WerfrapportFoto> & Pick<WerfrapportFoto, 'rapport_id' | 'storage_path'>;
        Update: Partial<WerfrapportFoto>;
      };
      werfrapport_reacties: {
        Row: WerfrapportReactie;
        Insert: Partial<WerfrapportReactie> & Pick<WerfrapportReactie, 'rapport_id' | 'auteur_id' | 'tekst'>;
        Update: Partial<WerfrapportReactie>;
      };
      werf_chat_berichten: {
        Row: WerfChatBericht;
        Insert: Partial<WerfChatBericht> & Pick<WerfChatBericht, 'werf_id' | 'auteur_id'>;
        Update: Partial<WerfChatBericht>;
      };
      werf_chat_reads: { Row: WerfChatRead; Insert: WerfChatRead; Update: Partial<WerfChatRead> };
      opmetingen: {
        Row: Opmeting;
        Insert: Partial<Opmeting> & Pick<Opmeting, 'verkoper_id' | 'module'>;
        Update: Partial<Opmeting>;
      };
      opmeting_fotos: {
        Row: OpmetingFoto;
        Insert: Partial<OpmetingFoto> & Pick<OpmetingFoto, 'opmeting_id' | 'storage_path'>;
        Update: Partial<OpmetingFoto>;
      };
      verlofaanvragen: {
        Row: Verlofaanvraag;
        Insert: Partial<Verlofaanvraag> & Pick<Verlofaanvraag, 'aanvrager_id' | 'type' | 'van' | 'tot'>;
        Update: Partial<Verlofaanvraag>;
      };
      plan_documenten: {
        Row: PlanDocument;
        Insert: Partial<PlanDocument> & Pick<PlanDocument, 'werf_id' | 'titel'>;
        Update: Partial<PlanDocument>;
      };
      plan_versies: {
        Row: PlanVersie;
        Insert: Partial<PlanVersie> & Pick<PlanVersie, 'document_id' | 'versie_nummer' | 'storage_path' | 'bestandsnaam' | 'geupload_door'>;
        Update: Partial<PlanVersie>;
      };
      plan_reads: { Row: PlanRead; Insert: PlanRead; Update: Partial<PlanRead> };
      magazijn_meldingen: {
        Row: MagazijnMelding;
        Insert: Partial<MagazijnMelding> & Pick<MagazijnMelding, 'melder_id'>;
        Update: Partial<MagazijnMelding>;
      };
      magazijn_meldingen_fotos: {
        Row: MagazijnMeldingFoto;
        Insert: Partial<MagazijnMeldingFoto> & Pick<MagazijnMeldingFoto, 'melding_id' | 'storage_path'>;
        Update: Partial<MagazijnMeldingFoto>;
      };
      formulieren: {
        Row: Formulier;
        Insert: Partial<Formulier> & Pick<Formulier, 'invuller_id' | 'formulier'>;
        Update: Partial<Formulier>;
      };
      formulier_fotos: {
        Row: FormulierFoto;
        Insert: Partial<FormulierFoto> & Pick<FormulierFoto, 'formulier_id' | 'storage_path'>;
        Update: Partial<FormulierFoto>;
      };
    };
  };
}
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/offlineQueue.ts" <<'WACHTELAER_EOF_MARKER'
import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { createRapport, addReactie, type NieuwRapportInput } from '@/lib/api/rapporten';
import { sendMessage, type SendMessageInput } from '@/lib/api/chat';
import { createOpmeting, type NieuweOpmetingInput } from '@/lib/api/opmetingen';
import { createAanvraag, type NieuweVerlofaanvraagInput } from '@/lib/api/verlof';
import { createMelding, type NieuweMeldingInput } from '@/lib/api/magazijn';
import { createFormulier, type NieuwFormulierInput } from '@/lib/api/formulieren';

const STORAGE_KEY = 'wachtelaer.offlineQueue.v1';

type QueuedAction =
  | { id: string; kind: 'submit_rapport'; createdAt: number; payload: NieuwRapportInput }
  | {
      id: string;
      kind: 'submit_reactie';
      createdAt: number;
      payload: { rapportId: string; auteurId: string; tekst: string };
    }
  | { id: string; kind: 'submit_chat_bericht'; createdAt: number; payload: SendMessageInput }
  | { id: string; kind: 'submit_opmeting'; createdAt: number; payload: NieuweOpmetingInput }
  | { id: string; kind: 'submit_verlofaanvraag'; createdAt: number; payload: NieuweVerlofaanvraagInput }
  | { id: string; kind: 'submit_magazijn_melding'; createdAt: number; payload: NieuweMeldingInput }
  | { id: string; kind: 'submit_formulier'; createdAt: number; payload: NieuwFormulierInput };

let queue: QueuedAction[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function hydrate() {
  if (hydrated) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  queue = raw ? JSON.parse(raw) : [];
  hydrated = true;
  notify();
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  notify();
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueRapport(payload: NieuwRapportInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_rapport', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueReactie(payload: { rapportId: string; auteurId: string; tekst: string }) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_reactie', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueChatBericht(payload: SendMessageInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_chat_bericht', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueOpmeting(payload: NieuweOpmetingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_opmeting', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueVerlofaanvraag(payload: NieuweVerlofaanvraagInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_verlofaanvraag', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueMagazijnMelding(payload: NieuweMeldingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_magazijn_melding', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueFormulier(payload: NieuwFormulierInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_formulier', createdAt: Date.now(), payload }];
  await persist();
}

export function getQueueLength() {
  return queue.length;
}

/** Tries to send every queued item. Leaves failures queued for the next attempt. */
export async function flushQueue() {
  await hydrate();
  const remaining: QueuedAction[] = [];
  for (const action of queue) {
    try {
      if (action.kind === 'submit_rapport') {
        await createRapport(action.payload);
      } else if (action.kind === 'submit_reactie') {
        await addReactie(action.payload.rapportId, action.payload.auteurId, action.payload.tekst);
      } else if (action.kind === 'submit_chat_bericht') {
        await sendMessage(action.payload);
      } else if (action.kind === 'submit_opmeting') {
        await createOpmeting(action.payload);
      } else if (action.kind === 'submit_verlofaanvraag') {
        await createAanvraag(action.payload);
      } else if (action.kind === 'submit_magazijn_melding') {
        await createMelding(action.payload);
      } else {
        await createFormulier(action.payload);
      }
    } catch {
      remaining.push(action);
    }
  }
  queue = remaining;
  await persist();
}

export function useQueueLength() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      hydrate();
      return () => listeners.delete(onChange);
    },
    () => queue.length,
    () => 0
  );
}

/** Online/offline status plus a queue that auto-flushes on reconnect. */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const queued = useQueueLength();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const nowOnline = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline((prevOnline) => {
        if (!prevOnline && nowOnline) flushQueue();
        return nowOnline;
      });
    });
    return unsub;
  }, []);

  const flushNow = useCallback(() => flushQueue(), []);

  return { isOnline, queued, flushNow };
}
WACHTELAER_EOF_MARKER

mkdir -p "lib/api"
cat > "lib/api/formulieren.ts" <<'WACHTELAER_EOF_MARKER'
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { FormKey } from '@/lib/formTemplates';
import type { Formulier } from '@/lib/database.types';

const FOTOS_BUCKET = 'formulier-fotos';

export interface NieuwFormulierInput {
  invullerId: string;
  formulier: FormKey;
  klantNaam: string;
  klantAdres: string;
  klantTel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  fotoUris: string[];
}

export async function createFormulier(input: NieuwFormulierInput): Promise<string> {
  const { data: formulier, error } = await supabase
    .from('formulieren')
    .insert({
      invuller_id: input.invullerId,
      formulier: input.formulier,
      klant_naam: input.klantNaam,
      klant_adres: input.klantAdres,
      klant_tel: input.klantTel,
      antwoorden: input.antwoorden,
      nota: input.nota,
    })
    .select('id')
    .single();
  if (error) throw error;

  for (const uri of input.fotoUris) {
    const { blob, ext, contentType } = await resolveImageBlob(uri);
    const filename = `${Crypto.randomUUID()}.${ext}`;
    const path = `${formulier.id}/${filename}`;
    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabase
      .from('formulier_fotos')
      .insert({ formulier_id: formulier.id, storage_path: path, label: filename });
    if (rowError) throw rowError;
  }

  return formulier.id;
}

export interface FormulierListItem extends Formulier {
  fotoCount: number;
}

export async function listMijnFormulieren(invullerId: string): Promise<FormulierListItem[]> {
  const { data: formulieren, error } = await supabase
    .from('formulieren')
    .select('*')
    .eq('invuller_id', invullerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!formulieren?.length) return [];

  const { data: fotos, error: fErr } = await supabase
    .from('formulier_fotos')
    .select('formulier_id')
    .in(
      'formulier_id',
      formulieren.map((f) => f.id)
    );
  if (fErr) throw fErr;

  const fotoCountById = new Map<string, number>();
  for (const f of fotos ?? []) {
    fotoCountById.set(f.formulier_id, (fotoCountById.get(f.formulier_id) ?? 0) + 1);
  }

  return formulieren.map((f) => ({ ...f, fotoCount: fotoCountById.get(f.id) ?? 0 }));
}
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer"
cat > "app/(tabs)/meer/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { countInBehandeling, countTeKeuren } from '@/lib/api/verlof';
import { colors, fonts, roleLabels } from '@/lib/theme';

export default function MeerTab() {
  const { profile, signOut } = useAuth();
  const isMgmt = profile?.role === 'mgmt';
  const [verlofSub, setVerlofSub] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      (isMgmt ? countTeKeuren() : countInBehandeling(profile.id)).then((n) => {
        setVerlofSub(isMgmt ? `${n} te beoordelen` : `${profile.verlof_dagen} dagen over · ${n} in behandeling`);
      });
    }, [profile, isMgmt])
  );

  return (
    <View style={styles.root}>
      <AppHeader kicker="Instellingen" />
      <View style={styles.body}>
        <View>
          <SectionLabel>Aangemeld als</SectionLabel>
          <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.role}>{profile ? roleLabels[profile.role] : ''}</Text>
        </View>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/verlof')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{isMgmt ? 'Verlofaanvragen' : 'Verlof aanvragen'}</Text>
            <Text style={styles.cardBody}>{verlofSub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/formulieren')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Formulieren</Text>
            <Text style={styles.cardBody}>Onderhoud, opstart, druktest en recuperatie invullen bij de klant.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </TouchableOpacity>

        {isMgmt ? (
          <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/ploeg')} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Ploeg &amp; rechten</Text>
              <Text style={styles.cardBody}>Rol, verlofsaldo en werftoewijzingen per medewerker.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Werkbonnen</Text>
          <Text style={styles.noteBody}>
            Werkbonnen en facturatie blijven in jullie bestaande systeem. Deze app verwijst er enkel naar.
          </Text>
        </View>

        <Button label="Afmelden" variant="secondary" onPress={signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 16, gap: 16 },
  name: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink, textTransform: 'uppercase' },
  role: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  card: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  noteCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 4 },
  noteTitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accentDarker,
  },
  noteBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
});
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer/formulieren"
cat > "app/(tabs)/meer/formulieren/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel, Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { FORM_TEMPLATES, getFormTemplate } from '@/lib/formTemplates';
import { listMijnFormulieren, type FormulierListItem } from '@/lib/api/formulieren';
import { colors, fonts } from '@/lib/theme';

export default function FormulierenScreen() {
  const { profile } = useAuth();
  const [mijnFormulieren, setMijnFormulieren] = useState<FormulierListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setMijnFormulieren(await listMijnFormulieren(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon formulieren niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.root}>
      <AppHeader kicker="Formulieren" />
      <BackRow label="Meer" onPress={() => router.replace('/meer')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Formulieren</Text>
          <Text style={styles.subtitle}>Kies een formulier om in te vullen bij de klant.</Text>
        </View>

        {FORM_TEMPLATES.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.card}
            onPress={() => router.push(`/meer/formulieren/${f.key}`)}
            accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitel}>{f.naam}</Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {f.sub}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.accent} />
          </TouchableOpacity>
        ))}

        <View>
          <SectionLabel>Mijn formulieren</SectionLabel>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {mijnFormulieren === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
          {mijnFormulieren?.length === 0 ? <Text style={styles.empty}>Nog geen formulieren ingevuld.</Text> : null}
          {mijnFormulieren?.map((f) => (
            <View key={f.id} style={styles.rijRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rijTitel} numberOfLines={1}>
                  {`${getFormTemplate(f.formulier).naam} — ${f.klant_naam || '(naam ontbreekt)'}`}
                </Text>
                <Text style={styles.rijMeta}>{formatDatum(f.created_at)}</Text>
              </View>
              {f.fotoCount > 0 ? <Tag label={`${f.fotoCount} foto's`} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  card: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitel: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  cardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  rijRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rijTitel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  rijMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer/formulieren"
cat > "app/(tabs)/meer/formulieren/[form].tsx" <<'WACHTELAER_EOF_MARKER'
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, NumberField, TextArea, TextField } from '@/components/ui/Form';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { createFormulier } from '@/lib/api/formulieren';
import { enqueueFormulier, useConnectivity } from '@/lib/offlineQueue';
import { getFormTemplate, type FormKey } from '@/lib/formTemplates';
import { missingVelden } from '@/lib/salesModules';
import { colors, fonts } from '@/lib/theme';

export default function FormulierInvulScreen() {
  const { form: formKey } = useLocalSearchParams<{ form: FormKey }>();
  const template = getFormTemplate(formKey);
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [kNaam, setKNaam] = useState('');
  const [kAdres, setKAdres] = useState('');
  const [kTel, setKTel] = useState('');
  const [antwoorden, setAntwoorden] = useState<Record<string, unknown>>({});
  const [nota, setNota] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setVeld = (id: string, waarde: unknown) => setAntwoorden((prev) => ({ ...prev, [id]: waarde }));

  const leeg = [...(kNaam.trim() ? [] : ['klantnaam']), ...missingVelden(template, antwoorden)];
  const ontbreekt = leeg.length ? leeg.join(' · ') : 'Niets — dit formulier is volledig ingevuld.';

  const submit = async () => {
    if (!profile || !kNaam.trim()) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      invullerId: profile.id,
      formulier: template.key,
      klantNaam: kNaam.trim(),
      klantAdres: kAdres.trim(),
      klantTel: kTel.trim(),
      antwoorden,
      nota: nota.trim(),
      fotoUris,
    };
    try {
      if (isOnline) await createFormulier(payload);
      else await enqueueFormulier(payload);
      router.replace({
        pathname: '/meer/formulieren/klaar',
        params: { offline: isOnline ? '0' : '1', formNaam: template.naam, klantNaam: kNaam.trim() },
      });
    } catch (e: any) {
      setError(e.message ?? 'Formulier versturen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker={`Formulier · ${template.naam}`} />
      <BackRow label="Ander formulier" onPress={() => router.replace('/meer/formulieren')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <SectionLabel>{template.naam}</SectionLabel>
          <Text style={styles.title}>Bij de klant</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ gap: 8 }}>
          <FieldLabel>Klant</FieldLabel>
          <TextField value={kNaam} onChangeText={setKNaam} placeholder="Naam" />
          <TextField value={kAdres} onChangeText={setKAdres} placeholder="Adres" />
          <TextField value={kTel} onChangeText={setKTel} placeholder="Telefoon of e-mail" />
        </View>

        {template.velden.map((v) => (
          <View key={v.id} style={{ gap: 7 }}>
            <FieldLabel>{v.label}</FieldLabel>
            {v.kind === 'keuze' ? (
              <ChipGroup opties={v.opties ?? []} value={antwoorden[v.id] as string} onChange={(val) => setVeld(v.id, val)} />
            ) : null}
            {v.kind === 'chips' ? (
              <ChipGroup
                opties={v.opties ?? []}
                value={antwoorden[v.id] as string[]}
                onChange={(val) => setVeld(v.id, val)}
                multi
              />
            ) : null}
            {v.kind === 'getal' ? (
              <NumberField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                eenheid={v.eenheid ?? ''}
              />
            ) : null}
            {v.kind === 'tekst' ? (
              <TextField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                placeholder={v.ph}
              />
            ) : null}
            {v.kind === 'datum' ? (
              <DatePickerField value={(antwoorden[v.id] as string) || ''} onChange={(val) => setVeld(v.id, val)} />
            ) : null}
            {v.hintTekst ? <Text style={styles.hint}>{v.hintTekst}</Text> : null}
          </View>
        ))}

        <View style={{ gap: 8 }}>
          <FieldLabel>{`Foto (${fotoUris.length})`}</FieldLabel>
          <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
        </View>

        <View style={{ gap: 6 }}>
          <FieldLabel>Nota (optioneel)</FieldLabel>
          <TextArea value={nota} onChangeText={setNota} placeholder="Bijkomende opmerkingen" />
        </View>

        <View style={styles.ontbreektCard}>
          <SectionLabel>Ontbreekt nog</SectionLabel>
          <Text style={styles.ontbreektText}>{ontbreekt}</Text>
        </View>

        <Button
          label={isOnline ? 'Formulier opslaan' : 'Opslaan in wachtrij'}
          onPress={submit}
          loading={submitting}
          disabled={!kNaam.trim()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 18, paddingBottom: 48 },
  title: { fontFamily: fonts.headingBold, fontSize: 25, textTransform: 'uppercase', color: colors.ink, marginTop: 4 },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted, lineHeight: 16 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  ontbreektCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 5 },
  ontbreektText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
});
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer/formulieren"
cat > "app/(tabs)/meer/formulieren/klaar.tsx" <<'WACHTELAER_EOF_MARKER'
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { colors, fonts } from '@/lib/theme';

export default function FormulierKlaarScreen() {
  const { offline, formNaam, klantNaam } = useLocalSearchParams<{
    offline: string;
    formNaam: string;
    klantNaam: string;
  }>();
  const isOffline = offline === '1';

  const routing = [
    { k: `Klantmap ${klantNaam ?? ''}`, v: isOffline ? 'wachtrij' : 'bijgewerkt' },
    { k: 'Dagelijkse lokale backup', v: 'volgende run' },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={28} color={colors.accentDark} />
      </View>
      <Text style={styles.title}>{isOffline ? 'Opgeslagen op toestel' : 'Formulier opgeslagen'}</Text>
      <Text style={styles.tekst}>
        {isOffline
          ? "Zodra je verbinding hebt gaat dit formulier met foto's mee naar de server."
          : `${formNaam ?? 'Het formulier'} is opgeslagen bij het klantdossier van ${klantNaam ?? ''}.`}
      </Text>

      <View style={styles.card}>
        <SectionLabel>Gaat naar</SectionLabel>
        {routing.map((r) => (
          <View key={r.k} style={styles.row}>
            <Text style={styles.rowKey} numberOfLines={1}>
              {r.k}
            </Text>
            <Text style={styles.rowVal}>{r.v}</Text>
          </View>
        ))}
      </View>

      <Button label="Naar formulieren" variant="secondary" onPress={() => router.replace('/meer/formulieren')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 16 },
  check: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.headingBold, fontSize: 26, textTransform: 'uppercase', color: colors.ink },
  tekst: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowKey: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, flexShrink: 1 },
  rowVal: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.accentDark },
});
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-opmetingen"
cat > "scripts/backup-opmetingen/backup.js" <<'WACHTELAER_EOF_MARKER'
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { moduleNaam, formatAntwoorden } = require('./salesModules');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR;
const FOTOS_BUCKET = 'opmeting-fotos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BACKUP_DIR) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BACKUP_DIR — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Service role key bypasses RLS — intentional, this backup needs to see
// every sales rep's opmetingen, not just one user's.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function slug(text) {
  return (text || 'onbekend')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function baseFilename(opmeting) {
  const datum = opmeting.created_at.slice(0, 10);
  const shortId = opmeting.id.slice(0, 8);
  return `${datum}_${slug(opmeting.klant_naam)}_${shortId}`;
}

/** One subfolder per klant, so everything for one customer ends up together. */
function klantMapNaam(opmeting) {
  return slug(opmeting.klant_naam);
}

async function writePdf(pdfPath, opmeting, verkoperNaam) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(18).text('Wachtelaer — Opmeting', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#5d5d60').text(moduleNaam(opmeting.module));
    doc.moveDown(1);

    doc.fillColor('#1d1f20').fontSize(10).text(`Datum: ${new Date(opmeting.created_at).toLocaleString('nl-BE')}`);
    doc.text(`Verkoper: ${verkoperNaam}`);
    doc.text(`Status: ${opmeting.status}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Klant', { underline: true });
    doc.fontSize(10);
    doc.text(`Naam: ${opmeting.klant_naam || '—'}`);
    doc.text(`Adres: ${opmeting.klant_adres || '—'}`);
    doc.text(`Telefoon/e-mail: ${opmeting.klant_tel || '—'}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Opmeting', { underline: true });
    doc.fontSize(10);
    const rows = formatAntwoorden(opmeting.module, opmeting.antwoorden);
    if (rows.length === 0) {
      doc.text('(geen velden ingevuld)');
    } else {
      for (const row of rows) {
        doc.text(`${row.label}: ${row.waarde}`);
      }
    }
    doc.moveDown(1);

    doc.fontSize(13).text('Wat wil de klant precies?', { underline: true });
    doc.fontSize(10).text(opmeting.nota || '—');

    doc.end();
  });
}

async function writeFotosZip(zipPath, fotos) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    output.on('error', reject);
  });
  archive.pipe(output);

  for (const foto of fotos) {
    const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(foto.storage_path);
    if (error) {
      console.warn(`  ! kon foto niet downloaden (${foto.storage_path}): ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    archive.append(buffer, { name: foto.label || path.basename(foto.storage_path) });
  }

  await archive.finalize();
  await closed;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const { data: opmetingen, error } = await supabase
    .from('opmetingen')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: true });
  if (error) throw error;

  let pdfsGemaakt = 0;
  let zipsGemaakt = 0;
  let overgeslagen = 0;

  for (const opmeting of opmetingen ?? []) {
    const base = baseFilename(opmeting);
    const klantDir = path.join(BACKUP_DIR, klantMapNaam(opmeting));
    // Anything already backed up flat in BACKUP_DIR (from before the
    // per-klant folders existed) stays there untouched — only check the
    // legacy path too so those entries aren't re-created as duplicates.
    const legacyPdfPath = path.join(BACKUP_DIR, `${base}.pdf`);
    const legacyZipPath = path.join(BACKUP_DIR, `${base}_fotos.zip`);
    const pdfPath = path.join(klantDir, `${base}.pdf`);
    const zipPath = path.join(klantDir, `${base}_fotos.zip`);
    const verkoperNaam = opmeting.profiles?.full_name ?? 'Onbekend';

    let deedIets = false;

    if (!fs.existsSync(pdfPath) && !fs.existsSync(legacyPdfPath)) {
      fs.mkdirSync(klantDir, { recursive: true });
      await writePdf(pdfPath, opmeting, verkoperNaam);
      pdfsGemaakt++;
      deedIets = true;
    }

    if (!fs.existsSync(zipPath) && !fs.existsSync(legacyZipPath)) {
      const { data: fotos, error: fotoError } = await supabase
        .from('opmeting_fotos')
        .select('storage_path, label')
        .eq('opmeting_id', opmeting.id);
      if (fotoError) throw fotoError;

      if (fotos && fotos.length > 0) {
        fs.mkdirSync(klantDir, { recursive: true });
        await writeFotosZip(zipPath, fotos);
        zipsGemaakt++;
        deedIets = true;
      }
    }

    if (!deedIets) overgeslagen++;
  }

  console.log(
    `Klaar — ${pdfsGemaakt} nieuwe pdf('s), ${zipsGemaakt} nieuwe foto-zip(s), ${overgeslagen} opmetingen waren al volledig gebackupt.`
  );
}

main().catch((err) => {
  console.error('Backup mislukt:', err);
  process.exitCode = 1;
});
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-werfrapporten"
cat > "scripts/backup-werfrapporten/backup.js" <<'WACHTELAER_EOF_MARKER'
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR;
const FOTOS_BUCKET = 'werfrapport-fotos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BACKUP_DIR) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BACKUP_DIR — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Service role key bypasses RLS — intentional, this backup needs to see
// every werf's rapporten, not just the ones shared with one user.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function slug(text) {
  return (text || 'onbekend')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function baseFilename(rapport, werfCode) {
  const shortId = rapport.id.slice(0, 8);
  return `${rapport.datum}_${slug(werfCode)}_${shortId}`;
}

/** One subfolder per werf, so everything for one site ends up together. */
function werfMapNaam(werf) {
  return `${slug(werf.code)}_${slug(werf.naam)}`;
}

function formatDeelMet(rapport) {
  const targets = [];
  if (rapport.deel_mgmt) targets.push('management');
  if (rapport.deel_werf) targets.push('werf');
  if (rapport.deel_klant) targets.push('klant');
  return targets.length ? targets.join(', ') : 'niemand';
}

async function writePdf(pdfPath, rapport, werf, auteurNaam, reacties) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(18).text('Wachtelaer — Werfrapport', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#5d5d60').text(`${werf.code} — ${werf.naam}`);
    doc.text(werf.adres || '—');
    doc.moveDown(1);

    doc.fillColor('#1d1f20').fontSize(10);
    doc.text(`Datum: ${new Date(rapport.datum).toLocaleDateString('nl-BE')}`);
    doc.text(`Opgesteld door: ${auteurNaam}`);
    doc.text(`Weer: ${rapport.weer}`);
    doc.text(`Aanwezig: ${rapport.aanwezig_eigen} eigen, ${rapport.aanwezig_onderaanneming} onderaanneming`);
    doc.text(`Gedeeld met: ${formatDeelMet(rapport)}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Uitgevoerd', { underline: true });
    doc.fontSize(10).text(rapport.uitgevoerd || '—');
    doc.moveDown(1);

    doc.fontSize(13).text('Knelpunt', { underline: true });
    doc.fontSize(10).text(rapport.knelpunt || '—');

    if (reacties.length > 0) {
      doc.moveDown(1);
      doc.fontSize(13).text('Reacties', { underline: true });
      doc.fontSize(10);
      for (const r of reacties) {
        doc.text(`${new Date(r.created_at).toLocaleString('nl-BE')} — ${r.auteurNaam}: ${r.tekst}`);
      }
    }

    doc.end();
  });
}

async function writeFotosZip(zipPath, fotos) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    output.on('error', reject);
  });
  archive.pipe(output);

  for (const foto of fotos) {
    const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(foto.storage_path);
    if (error) {
      console.warn(`  ! kon foto niet downloaden (${foto.storage_path}): ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    archive.append(buffer, { name: foto.label || path.basename(foto.storage_path) });
  }

  await archive.finalize();
  await closed;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const { data: rapporten, error } = await supabase
    .from('werfrapporten')
    .select('*, werven(code, naam, adres), profiles(full_name)')
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  let pdfsGemaakt = 0;
  let zipsGemaakt = 0;
  let overgeslagen = 0;

  for (const rapport of rapporten ?? []) {
    const werf = rapport.werven ?? { code: 'onbekend', naam: 'Onbekende werf', adres: '' };
    const auteurNaam = rapport.profiles?.full_name ?? 'Onbekend';
    const base = baseFilename(rapport, werf.code);
    const werfDir = path.join(BACKUP_DIR, werfMapNaam(werf));
    // Anything already backed up flat in BACKUP_DIR (from before the
    // per-werf folders existed) stays there untouched — only check the
    // legacy path too so those entries aren't re-created as duplicates.
    const legacyPdfPath = path.join(BACKUP_DIR, `${base}.pdf`);
    const legacyZipPath = path.join(BACKUP_DIR, `${base}_fotos.zip`);
    const pdfPath = path.join(werfDir, `${base}.pdf`);
    const zipPath = path.join(werfDir, `${base}_fotos.zip`);

    let deedIets = false;

    if (!fs.existsSync(pdfPath) && !fs.existsSync(legacyPdfPath)) {
      const { data: reactiesRaw, error: reactiesError } = await supabase
        .from('werfrapport_reacties')
        .select('tekst, created_at, profiles(full_name)')
        .eq('rapport_id', rapport.id)
        .order('created_at', { ascending: true });
      if (reactiesError) throw reactiesError;
      const reacties = (reactiesRaw ?? []).map((r) => ({
        tekst: r.tekst,
        created_at: r.created_at,
        auteurNaam: r.profiles?.full_name ?? 'Onbekend',
      }));

      fs.mkdirSync(werfDir, { recursive: true });
      await writePdf(pdfPath, rapport, werf, auteurNaam, reacties);
      pdfsGemaakt++;
      deedIets = true;
    }

    if (!fs.existsSync(zipPath) && !fs.existsSync(legacyZipPath)) {
      const { data: fotos, error: fotoError } = await supabase
        .from('werfrapport_fotos')
        .select('storage_path, label')
        .eq('rapport_id', rapport.id);
      if (fotoError) throw fotoError;

      if (fotos && fotos.length > 0) {
        fs.mkdirSync(werfDir, { recursive: true });
        await writeFotosZip(zipPath, fotos);
        zipsGemaakt++;
        deedIets = true;
      }
    }

    if (!deedIets) overgeslagen++;
  }

  console.log(
    `Klaar — ${pdfsGemaakt} nieuwe pdf('s), ${zipsGemaakt} nieuwe foto-zip(s), ${overgeslagen} rapporten waren al volledig gebackupt.`
  );
}

main().catch((err) => {
  console.error('Backup mislukt:', err);
  process.exitCode = 1;
});
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/.env.example" <<'WACHTELAER_EOF_MARKER'
# Project Settings → API → Project URL
SUPABASE_URL=https://your-project.supabase.co

# Project Settings → API → service_role key (SECRET — bypasses RLS, never
# put this in the app or commit it anywhere). Needed here because the
# backup must see every formulier, not just one user's own.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Where PDFs and photo zips get written, one subfolder per klant. Use a
# Windows path when running this on Windows, e.g.
# P:\Projecten Linear\App\Formulieren
BACKUP_DIR=P:\Projecten Linear\App\Formulieren
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/.gitignore" <<'WACHTELAER_EOF_MARKER'
node_modules/
.env
backup.log
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/README.md" <<'WACHTELAER_EOF_MARKER'
# Formulieren backup

Daily local backup of every ingevuld formulier (onderhoud airco,
onderhoud ventilatie, recuperatie koelmiddel, druktest leidingen, opstart
airco): one PDF per formulier (klantgegevens, ingevulde velden, nota)
plus a zip of its photos, written to a folder per klant on this machine.
Skips anything already backed up, so a missed day or a re-run is
harmless.

This runs independently of the app — it's a small standalone Node.js
script meant for a Windows machine that's always on, scheduled daily via
Task Scheduler. It's a separate script from `../backup-opmetingen` and
`../backup-werfrapporten` (different table, different folder) so all
three can run on their own schedules.

## Setup

### 1. Install Node.js (skip if already installed, e.g. you already set up
   the opmetingen or werfrapporten backup on this same machine)

Download the **LTS** installer from [nodejs.org](https://nodejs.org) and
run it with defaults. Open a **new** Command Prompt afterwards (PATH
changes don't apply to windows already open) and confirm with:

```
node -v
```

### 2. Configure

```
cd scripts\backup-formulieren
copy .env.example .env
npm install
```

Edit `.env`:
- `SUPABASE_URL` — Project Settings → API → Project URL (same value as
  the other backups' `.env`)
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role**
  key (same value too). This is a secret that bypasses row-level security
  (needed so the backup sees every formulier) — never put it in the app,
  never commit it, never share it outside this one `.env` file.
- `BACKUP_DIR` — already defaulted to `P:\Projecten Linear\App\Formulieren`

### 3. Try it once by hand

```
node backup.js
```

You should see a summary line like:
```
Klaar — 3 nieuwe pdf('s), 1 nieuwe foto-zip(s), 0 formulieren waren al volledig gebackupt.
```
and a subfolder per klant appear in the `BACKUP_DIR` folder, each with
that klant's PDFs (and photo zips, if any).

### 4. Schedule it daily

Same as the other two backups, but as its **own** task pointing at this
folder's `run-backup.bat`:

1. Open **Task Scheduler**
2. **Create Task…** (not "Basic Task", so the "Start in" field is available)
3. **General** tab: name it e.g. `Wachtelaer formulieren backup`. Under
   "Security options", pick **Run whether user is logged on or not**.
4. **Triggers** tab → **New…** → Daily, pick a time (e.g. 02:30, so it
   doesn't overlap the other backups)
5. **Actions** tab → **New…**:
   - Program/script: full path to `run-backup.bat` in this folder, e.g.
     `C:\path\to\WachtelaerVeldapp\scripts\backup-formulieren\run-backup.bat`
   - Start in: the same folder (so the `.env` file is found)
6. Save. Right-click the task → **Run** to test it fires correctly.

Each run appends to `backup.log` in this folder — check that if a
scheduled run doesn't produce the expected files.
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/backup.js" <<'WACHTELAER_EOF_MARKER'
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { formNaam, formatAntwoorden } = require('./formTemplates');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR;
const FOTOS_BUCKET = 'formulier-fotos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BACKUP_DIR) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BACKUP_DIR — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Service role key bypasses RLS — intentional, this backup needs to see
// every formulier, not just one user's own.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function slug(text) {
  return (text || 'onbekend')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function baseFilename(formulier) {
  const datum = formulier.created_at.slice(0, 10);
  const shortId = formulier.id.slice(0, 8);
  return `${datum}_${slug(formulier.formulier)}_${shortId}`;
}

/** One subfolder per klant, so everything for one customer ends up together. */
function klantMapNaam(formulier) {
  return slug(formulier.klant_naam);
}

async function writePdf(pdfPath, formulier, invullerNaam) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(18).text('Wachtelaer — Formulier', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#5d5d60').text(formNaam(formulier.formulier));
    doc.moveDown(1);

    doc.fillColor('#1d1f20').fontSize(10).text(`Datum: ${new Date(formulier.created_at).toLocaleString('nl-BE')}`);
    doc.text(`Ingevuld door: ${invullerNaam}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Klant', { underline: true });
    doc.fontSize(10);
    doc.text(`Naam: ${formulier.klant_naam || '—'}`);
    doc.text(`Adres: ${formulier.klant_adres || '—'}`);
    doc.text(`Telefoon/e-mail: ${formulier.klant_tel || '—'}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Formulier', { underline: true });
    doc.fontSize(10);
    const rows = formatAntwoorden(formulier.formulier, formulier.antwoorden);
    if (rows.length === 0) {
      doc.text('(geen velden ingevuld)');
    } else {
      for (const row of rows) {
        doc.text(`${row.label}: ${row.waarde}`);
      }
    }
    doc.moveDown(1);

    doc.fontSize(13).text('Nota', { underline: true });
    doc.fontSize(10).text(formulier.nota || '—');

    doc.end();
  });
}

async function writeFotosZip(zipPath, fotos) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    output.on('error', reject);
  });
  archive.pipe(output);

  for (const foto of fotos) {
    const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(foto.storage_path);
    if (error) {
      console.warn(`  ! kon foto niet downloaden (${foto.storage_path}): ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    archive.append(buffer, { name: foto.label || path.basename(foto.storage_path) });
  }

  await archive.finalize();
  await closed;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const { data: formulieren, error } = await supabase
    .from('formulieren')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: true });
  if (error) throw error;

  let pdfsGemaakt = 0;
  let zipsGemaakt = 0;
  let overgeslagen = 0;

  for (const formulier of formulieren ?? []) {
    const base = baseFilename(formulier);
    const klantDir = path.join(BACKUP_DIR, klantMapNaam(formulier));
    const pdfPath = path.join(klantDir, `${base}.pdf`);
    const zipPath = path.join(klantDir, `${base}_fotos.zip`);
    const invullerNaam = formulier.profiles?.full_name ?? 'Onbekend';

    let deedIets = false;

    if (!fs.existsSync(pdfPath)) {
      fs.mkdirSync(klantDir, { recursive: true });
      await writePdf(pdfPath, formulier, invullerNaam);
      pdfsGemaakt++;
      deedIets = true;
    }

    if (!fs.existsSync(zipPath)) {
      const { data: fotos, error: fotoError } = await supabase
        .from('formulier_fotos')
        .select('storage_path, label')
        .eq('formulier_id', formulier.id);
      if (fotoError) throw fotoError;

      if (fotos && fotos.length > 0) {
        fs.mkdirSync(klantDir, { recursive: true });
        await writeFotosZip(zipPath, fotos);
        zipsGemaakt++;
        deedIets = true;
      }
    }

    if (!deedIets) overgeslagen++;
  }

  console.log(
    `Klaar — ${pdfsGemaakt} nieuwe pdf('s), ${zipsGemaakt} nieuwe foto-zip(s), ${overgeslagen} formulieren waren al volledig gebackupt.`
  );
}

main().catch((err) => {
  console.error('Backup mislukt:', err);
  process.exitCode = 1;
});
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/formTemplates.js" <<'WACHTELAER_EOF_MARKER'
// Plain-JS mirror of ../../lib/formTemplates.ts, trimmed to what the PDF
// renderer needs (labels + units for a readable printout). Keep in sync
// by hand if fields change — this script runs standalone, outside the
// Expo/TypeScript build.

const FORM_NAMES = {
  onderhoud_airco: 'Onderhoud airco',
  onderhoud_ventilatie: 'Onderhoud ventilatie',
  recuperatie_koelmiddel: 'Recuperatie koelmiddel',
  druktest_leidingen: 'Druktest leidingen',
  opstart_airco: 'Opstart airco',
};

const VELD_LABELS = {
  onderhoud_airco: {
    merk_model: { label: 'Merk/model' },
    serienummer: { label: 'Serienummer' },
    koelmiddel: { label: 'Koelmiddel' },
    druk: { label: 'Gemeten druk', eenheid: 'bar' },
    filters: { label: 'Filters' },
    buitenunit: { label: 'Buitenunit gereinigd' },
    binnenunit: { label: 'Binnenunit gereinigd' },
    afvoer: { label: 'Afvoer gecontroleerd' },
    elektrisch: { label: 'Elektrische aansluitingen gecontroleerd' },
    werking: { label: 'Werking getest' },
    gebreken: { label: 'Vastgestelde gebreken' },
    volgend_onderhoud: { label: 'Volgend onderhoud' },
  },
  onderhoud_ventilatie: {
    systeem: { label: 'Type systeem' },
    filters: { label: 'Filters' },
    ventilatoren: { label: 'Ventilatoren gecontroleerd' },
    kanalen: { label: 'Kanalen gereinigd' },
    debiet: { label: 'Debiet gemeten', eenheid: 'm³/h' },
    geluid: { label: 'Abnormaal geluid' },
    gebreken: { label: 'Vastgestelde gebreken' },
    volgend_onderhoud: { label: 'Volgend onderhoud' },
  },
  recuperatie_koelmiddel: {
    koelmiddel: { label: 'Koelmiddel' },
    hoeveelheid: { label: 'Hoeveelheid gerecupereerd', eenheid: 'kg' },
    herkomst: { label: 'Herkomst / toestel' },
    reden: { label: 'Reden' },
    cilindernummer: { label: 'Cilindernummer' },
    certificaat: { label: 'Technicus-certificaatnummer' },
    lekdetectie: { label: 'Lekdetectie uitgevoerd' },
  },
  druktest_leidingen: {
    type_leiding: { label: 'Type leiding' },
    medium: { label: 'Testmedium' },
    testdruk: { label: 'Testdruk', eenheid: 'bar' },
    testduur: { label: 'Testduur', eenheid: 'minuten' },
    resultaat: { label: 'Resultaat' },
    lek_locatie: { label: 'Locatie lek (indien gefaald)' },
    manometer: { label: 'Gebruikte manometer' },
  },
  opstart_airco: {
    merk_model: { label: 'Merk/model binnen- en buitenunit' },
    serienummers: { label: 'Serienummers' },
    koelmiddel: { label: 'Koelmiddel' },
    fabrieksvulling: { label: 'Fabrieksvulling', eenheid: 'kg' },
    bijgevuld: { label: 'Bijgevulde hoeveelheid', eenheid: 'kg' },
    elektrisch: { label: 'Elektrische voeding gecontroleerd' },
    vacuum: { label: 'Vacuümtest uitgevoerd' },
    werkdruk: { label: 'Werkdruk gemeten', eenheid: 'bar' },
    werking: { label: 'Werking getest' },
    uitleg: { label: 'Uitleg gegeven aan klant' },
  },
};

function formNaam(key) {
  return FORM_NAMES[key] || key;
}

/** Returns [{ label, waarde }] in a stable, readable order for the PDF. */
function formatAntwoorden(formKey, antwoorden) {
  const veldLabels = VELD_LABELS[formKey] || {};
  return Object.entries(veldLabels)
    .map(([id, meta]) => {
      const raw = antwoorden ? antwoorden[id] : undefined;
      if (raw === undefined || raw === null || raw === '') return null;
      const waarde = Array.isArray(raw)
        ? raw
            .filter(Boolean)
            .map((x) => (meta.eenheid ? `${x} ${meta.eenheid}` : String(x)))
            .join(', ')
        : meta.eenheid
          ? `${raw} ${meta.eenheid}`
          : String(raw);
      return { label: meta.label, waarde };
    })
    .filter(Boolean);
}

module.exports = { formNaam, formatAntwoorden };
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/package.json" <<'WACHTELAER_EOF_MARKER'
{
  "name": "wachtelaer-formulieren-backup",
  "version": "1.0.0",
  "private": true,
  "description": "Daily local backup of formulieren (PDF) and their photos (zip) to a folder per klant.",
  "main": "backup.js",
  "scripts": {
    "backup": "node backup.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.112.3",
    "archiver": "7.0.1",
    "dotenv": "17.4.2",
    "pdfkit": "0.19.1"
  }
}
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/package-lock.json" <<'WACHTELAER_EOF_MARKER'
{
  "name": "wachtelaer-formulieren-backup",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "wachtelaer-formulieren-backup",
      "version": "1.0.0",
      "dependencies": {
        "@supabase/supabase-js": "2.112.3",
        "archiver": "7.0.1",
        "dotenv": "17.4.2",
        "pdfkit": "0.19.1"
      }
    },
    "node_modules/@isaacs/cliui": {
      "version": "8.0.2",
      "resolved": "https://registry.npmjs.org/@isaacs/cliui/-/cliui-8.0.2.tgz",
      "integrity": "sha512-O8jcjabXaleOG9DQ0+ARXWZBTfnP4WNAqzuiJK7ll44AmxGKv/J2M4TPjxjY3znBCfvBXFzucm1twdyFybFqEA==",
      "license": "ISC",
      "dependencies": {
        "string-width": "^5.1.2",
        "string-width-cjs": "npm:string-width@^4.2.0",
        "strip-ansi": "^7.0.1",
        "strip-ansi-cjs": "npm:strip-ansi@^6.0.1",
        "wrap-ansi": "^8.1.0",
        "wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/@noble/ciphers": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/@noble/ciphers/-/ciphers-1.3.0.tgz",
      "integrity": "sha512-2I0gnIVPtfnMw9ee9h1dJG7tp81+8Ob3OJb3Mv37rx5L40/b0i7djjCVvGOVqc9AEIQyvyu1i6ypKdFw8R8gQw==",
      "license": "MIT",
      "engines": {
        "node": "^14.21.3 || >=16"
      },
      "funding": {
        "url": "https://paulmillr.com/funding/"
      }
    },
    "node_modules/@noble/hashes": {
      "version": "1.8.0",
      "resolved": "https://registry.npmjs.org/@noble/hashes/-/hashes-1.8.0.tgz",
      "integrity": "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==",
      "license": "MIT",
      "engines": {
        "node": "^14.21.3 || >=16"
      },
      "funding": {
        "url": "https://paulmillr.com/funding/"
      }
    },
    "node_modules/@pkgjs/parseargs": {
      "version": "0.11.0",
      "resolved": "https://registry.npmjs.org/@pkgjs/parseargs/-/parseargs-0.11.0.tgz",
      "integrity": "sha512-+1VkjdD0QBLPodGrJUeqarH8VAIvQODIbwh9XpP5Syisf7YoQgsJKPNFoqqLQlu+VQ/tVSshMR6loPMn8U+dPg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@supabase/auth-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/auth-js/-/auth-js-2.112.3.tgz",
      "integrity": "sha512-NA0rsgAlWZPvbhw8aUdmgfpHVgUAcd8zK5ov43l++o1bLIPXZhRiAlRobhwF5AatQuovpqxsMH50F4oyyV4XZw==",
      "license": "MIT",
      "dependencies": {
        "tslib": "2.8.1"
      },
      "engines": {
        "node": ">=22.0.0"
      }
    },
    "node_modules/@supabase/functions-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/functions-js/-/functions-js-2.112.3.tgz",
      "integrity": "sha512-gfv481mTOVWtZIJgXupxZpni2V2UWPf6jeF/jOK7HdMHdH+mt6sU0sHHwf0POsPip8ltlulu9OUHgwVzl5ddRw==",
      "license": "MIT",
      "dependencies": {
        "tslib": "2.8.1"
      },
      "engines": {
        "node": ">=22.0.0"
      }
    },
    "node_modules/@supabase/phoenix": {
      "version": "0.4.5",
      "resolved": "https://registry.npmjs.org/@supabase/phoenix/-/phoenix-0.4.5.tgz",
      "integrity": "sha512-aAn9H9ovVyeApKy11OWOrrOGq8DV68yWeH4ud2lN9fzn4aO8Zb5GLL9m1pUg9nLqIcT+ZDfAcsZe0E/nqdv2lw==",
      "license": "MIT"
    },
    "node_modules/@supabase/postgrest-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/postgrest-js/-/postgrest-js-2.112.3.tgz",
      "integrity": "sha512-+Mf6uCpzr00bqxwX8hTK2X2L9eAL/1vuOjdEjx6upz9ulb0RmQT16XeU/JkMUlVHw/B46ZnPa2busY4Kd9YCzw==",
      "license": "MIT",
      "dependencies": {
        "tslib": "2.8.1"
      },
      "engines": {
        "node": ">=22.0.0"
      }
    },
    "node_modules/@supabase/realtime-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/realtime-js/-/realtime-js-2.112.3.tgz",
      "integrity": "sha512-E6wljXWs7DUOloyIB69i3YFInWE6IyCvgTAbQ0KYxOHv26FdA1KzEXTuzxrYEdf70t406Z9BRwUlGyclGF2FXA==",
      "license": "MIT",
      "dependencies": {
        "@supabase/phoenix": "0.4.5",
        "tslib": "2.8.1"
      },
      "engines": {
        "node": ">=22.0.0"
      }
    },
    "node_modules/@supabase/storage-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/storage-js/-/storage-js-2.112.3.tgz",
      "integrity": "sha512-oSK61tzlUvg+BWPqpKQCu9qqonsO26btaoAR9D6Gest2aj7xUqToj9rKyaoYOJczkhg9BjqA1REbYy9tPI4bDA==",
      "license": "MIT",
      "dependencies": {
        "iceberg-js": "^0.8.1",
        "tslib": "2.8.1"
      },
      "engines": {
        "node": ">=22.0.0"
      }
    },
    "node_modules/@supabase/supabase-js": {
      "version": "2.112.3",
      "resolved": "https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.112.3.tgz",
      "integrity": "sha512-Jv1bxVQmEJNkjvPEhFaKjPzsh+Ozyew6lWGD+SoYcsclDEP1z7yEvKvfUQfzy0DkxRIQnZNxmmWtAzw5XLTQoA==",
      "license": "MIT",
      "dependencies": {
        "@supabase/auth-js": "2.112.3",
        "@supabase/functions-js": "2.112.3",
        "@supabase/postgrest-js": "2.112.3",
        "@supabase/realtime-js": "2.112.3",
        "@supabase/storage-js": "2.112.3"
      },
      "engines": {
        "node": ">=22.0.0"
      },
      "peerDependencies": {
        "@opentelemetry/api": ">=1.0.0"
      },
      "peerDependenciesMeta": {
        "@opentelemetry/api": {
          "optional": true
        }
      }
    },
    "node_modules/@swc/helpers": {
      "version": "0.5.23",
      "resolved": "https://registry.npmjs.org/@swc/helpers/-/helpers-0.5.23.tgz",
      "integrity": "sha512-5lSsMOTXURePglDfvuAQUqkGek9Hg2kksOYay2m0+XR++b2NWYL/4sWyuvVBIs8oKnJaxkdi9whaL/sqN13afw==",
      "license": "Apache-2.0",
      "dependencies": {
        "tslib": "^2.8.0"
      }
    },
    "node_modules/abort-controller": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/abort-controller/-/abort-controller-3.0.0.tgz",
      "integrity": "sha512-h8lQ8tacZYnR3vNQTgibj+tODHI5/+l06Au2Pcriv/Gmet0eaj4TwWH41sO9wnHDiQsEj19q0drzdWdeAHtweg==",
      "license": "MIT",
      "dependencies": {
        "event-target-shim": "^5.0.0"
      },
      "engines": {
        "node": ">=6.5"
      }
    },
    "node_modules/ansi-regex": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-6.3.0.tgz",
      "integrity": "sha512-WpDfL7NO6j7tH88IDBNVdUJxDh9nmCteAVW9dsep846XdwF4naCBK+/tGLX3KJgcpgMRXCFlTM2hKGoK9FsdrQ==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-regex?sponsor=1"
      }
    },
    "node_modules/ansi-styles": {
      "version": "6.2.3",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-6.2.3.tgz",
      "integrity": "sha512-4Dj6M28JB+oAH8kFkTLUo+a2jwOFkuqb3yucU0CANcRRUbxS0cP0nZYCGjcc3BNXwRIsUVmDGgzawme7zvJHvg==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/archiver": {
      "version": "7.0.1",
      "resolved": "https://registry.npmjs.org/archiver/-/archiver-7.0.1.tgz",
      "integrity": "sha512-ZcbTaIqJOfCc03QwD468Unz/5Ir8ATtvAHsK+FdXbDIbGfihqh9mrvdcYunQzqn4HrvWWaFyaxJhGZagaJJpPQ==",
      "license": "MIT",
      "dependencies": {
        "archiver-utils": "^5.0.2",
        "async": "^3.2.4",
        "buffer-crc32": "^1.0.0",
        "readable-stream": "^4.0.0",
        "readdir-glob": "^1.1.2",
        "tar-stream": "^3.0.0",
        "zip-stream": "^6.0.1"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/archiver-utils": {
      "version": "5.0.2",
      "resolved": "https://registry.npmjs.org/archiver-utils/-/archiver-utils-5.0.2.tgz",
      "integrity": "sha512-wuLJMmIBQYCsGZgYLTy5FIB2pF6Lfb6cXMSF8Qywwk3t20zWnAi7zLcQFdKQmIB8wyZpY5ER38x08GbwtR2cLA==",
      "license": "MIT",
      "dependencies": {
        "glob": "^10.0.0",
        "graceful-fs": "^4.2.0",
        "is-stream": "^2.0.1",
        "lazystream": "^1.0.0",
        "lodash": "^4.17.15",
        "normalize-path": "^3.0.0",
        "readable-stream": "^4.0.0"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/async": {
      "version": "3.2.6",
      "resolved": "https://registry.npmjs.org/async/-/async-3.2.6.tgz",
      "integrity": "sha512-htCUDlxyyCLMgaM3xXg0C0LW2xqfuQ6p05pCEIsXuyQ+a1koYKTuBMzRNwmybfLgvJDMd0r1LTn4+E0Ti6C2AA==",
      "license": "MIT"
    },
    "node_modules/b4a": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/b4a/-/b4a-1.8.1.tgz",
      "integrity": "sha512-aiqre1Nr0B/6DgE2N5vwTc+2/oQZ4Wh1t4NznYY4E00y8LCt6NqdRv81so00oo27D8MVKTpUa/MwUUtBLXCoDw==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "react-native-b4a": "*"
      },
      "peerDependenciesMeta": {
        "react-native-b4a": {
          "optional": true
        }
      }
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "license": "MIT"
    },
    "node_modules/bare-events": {
      "version": "2.9.1",
      "resolved": "https://registry.npmjs.org/bare-events/-/bare-events-2.9.1.tgz",
      "integrity": "sha512-Z0oHEHAFDZkffN8Qc39zNZjQlMDkPJRyyyZieU1VH7u8c5S+qHZ2S8ixdKIAxEjfHO7FJxXmJWgteOghVanIsg==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "bare-abort-controller": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        }
      }
    },
    "node_modules/bare-fs": {
      "version": "4.8.0",
      "resolved": "https://registry.npmjs.org/bare-fs/-/bare-fs-4.8.0.tgz",
      "integrity": "sha512-fM+MhCvdQhZ7NV6S95a07gPSqjIYKn6mFaXfx266wN3ajZGl/+1AzH+ubkXQ0fFZvOe2nk9VHkzdYkQE5zMV3Q==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.5.4",
        "bare-path": "^3.0.0",
        "bare-stream": "^2.6.4",
        "bare-url": "^2.2.2",
        "fast-fifo": "^1.3.2"
      },
      "engines": {
        "bare": ">=1.28.0"
      },
      "peerDependencies": {
        "bare-buffer": "*"
      },
      "peerDependenciesMeta": {
        "bare-buffer": {
          "optional": true
        }
      }
    },
    "node_modules/bare-path": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/bare-path/-/bare-path-3.1.1.tgz",
      "integrity": "sha512-JprUlveX3QjApC1cTpsUOiscADftCGVWkzitbHsRqv84hzYwYHw2mbluddsq5TvI8mH/8Ov1f4BiMAdcB0oYnQ==",
      "license": "Apache-2.0"
    },
    "node_modules/bare-stream": {
      "version": "2.13.3",
      "resolved": "https://registry.npmjs.org/bare-stream/-/bare-stream-2.13.3.tgz",
      "integrity": "sha512-Kc+brLqvEqGkjyfiwJmImAOqLZL7OsoLKuavx+hJjgVV3nLTOjloJyPMFxjUPerGGHrNH0fLU06jjykMLWrERQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.8.1",
        "streamx": "^2.25.0",
        "teex": "^1.0.1"
      },
      "peerDependencies": {
        "bare-abort-controller": "*",
        "bare-buffer": "*",
        "bare-events": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        },
        "bare-buffer": {
          "optional": true
        },
        "bare-events": {
          "optional": true
        }
      }
    },
    "node_modules/bare-url": {
      "version": "2.5.2",
      "resolved": "https://registry.npmjs.org/bare-url/-/bare-url-2.5.2.tgz",
      "integrity": "sha512-L13PCJzKG8RGvx8V1/DdMi12ERhC3tprr7/8a94BxpmnRsFqxh5XZNdhtMxu5HPkRshYOOWRGY8lDP7ZhpG9Cg==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/base64-js": {
      "version": "1.5.1",
      "resolved": "https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz",
      "integrity": "sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/brace-expansion": {
      "version": "2.1.4",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.4.tgz",
      "integrity": "sha512-hGfVzPxthbf3+2yjg/RBs60cB0FhqBS/zvdV/4wn4/BmN0bNMMHPc4V/BbFieqf1TKAGGAHnY4eSjajCl0f2Xg==",
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0"
      }
    },
    "node_modules/brotli": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/brotli/-/brotli-1.3.3.tgz",
      "integrity": "sha512-oTKjJdShmDuGW94SyyaoQvAjf30dZaHnjJ8uAF+u2/vGJkJbJPJAT1gDiOJP5v1Zb6f9KEyW/1HpuaWIXtGHPg==",
      "license": "MIT",
      "dependencies": {
        "base64-js": "^1.1.2"
      }
    },
    "node_modules/browserify-zlib": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/browserify-zlib/-/browserify-zlib-0.2.0.tgz",
      "integrity": "sha512-Z942RysHXmJrhqk88FmKBVq/v5tqmSkDz7p54G/MGyjMnCFFnC79XWNbg+Vta8W6Wb2qtSZTSxIGkJrRpCFEiA==",
      "license": "MIT",
      "dependencies": {
        "pako": "~1.0.5"
      }
    },
    "node_modules/buffer": {
      "version": "6.0.3",
      "resolved": "https://registry.npmjs.org/buffer/-/buffer-6.0.3.tgz",
      "integrity": "sha512-FTiCpNxtwiZZHEZbcbTIcZjERVICn9yq/pDFkTl95/AxzD1naBctN7YO68riM/gLSDY7sdrMby8hofADYuuqOA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "base64-js": "^1.3.1",
        "ieee754": "^1.2.1"
      }
    },
    "node_modules/buffer-crc32": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/buffer-crc32/-/buffer-crc32-1.0.0.tgz",
      "integrity": "sha512-Db1SbgBS/fg/392AblrMJk97KggmvYhr4pB5ZIMTWtaivCPMWLkmb7m21cJvpvgK+J3nsU2CmmixNBZx4vFj/w==",
      "license": "MIT",
      "engines": {
        "node": ">=8.0.0"
      }
    },
    "node_modules/clone": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/clone/-/clone-2.1.2.tgz",
      "integrity": "sha512-3Pe/CF1Nn94hyhIYpjtiLhdCoEoz0DqQ+988E9gmeEdQZlojxnOb74wctFyuwWQHzqyf9X7C7MG8juUpqBJT8w==",
      "license": "MIT",
      "engines": {
        "node": ">=0.8"
      }
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "license": "MIT"
    },
    "node_modules/compress-commons": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/compress-commons/-/compress-commons-6.0.2.tgz",
      "integrity": "sha512-6FqVXeETqWPoGcfzrXb37E50NP0LXT8kAMu5ooZayhWWdgEY4lBEEcbQNXtkuKQsGduxiIcI4gOTsxTmuq/bSg==",
      "license": "MIT",
      "dependencies": {
        "crc-32": "^1.2.0",
        "crc32-stream": "^6.0.0",
        "is-stream": "^2.0.1",
        "normalize-path": "^3.0.0",
        "readable-stream": "^4.0.0"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/core-util-is": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.3.tgz",
      "integrity": "sha512-ZQBvi1DcpJ4GDqanjucZ2Hj3wEO5pZDS89BWbkcrvdxksJorwUDDZamX9ldFkp9aw2lmBDLgkObEA4DWNJ9FYQ==",
      "license": "MIT"
    },
    "node_modules/crc-32": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/crc-32/-/crc-32-1.2.2.tgz",
      "integrity": "sha512-ROmzCKrTnOwybPcJApAA6WBWij23HVfGVNKqqrZpuyZOHqK2CwHSvpGuyt/UNNvaIjEd8X5IFGp4Mh+Ie1IHJQ==",
      "license": "Apache-2.0",
      "bin": {
        "crc32": "bin/crc32.njs"
      },
      "engines": {
        "node": ">=0.8"
      }
    },
    "node_modules/crc32-stream": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/crc32-stream/-/crc32-stream-6.0.0.tgz",
      "integrity": "sha512-piICUB6ei4IlTv1+653yq5+KoqfBYmj9bw6LqXoOneTMDXk5nM1qt12mFW1caG3LlJXEKW1Bp0WggEmIfQB34g==",
      "license": "MIT",
      "dependencies": {
        "crc-32": "^1.2.0",
        "readable-stream": "^4.0.0"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/dfa": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/dfa/-/dfa-1.2.0.tgz",
      "integrity": "sha512-ED3jP8saaweFTjeGX8HQPjeC1YYyZs98jGNZx6IiBvxW7JG5v492kamAQB3m2wop07CvU/RQmzcKr6bgcC5D/Q==",
      "license": "MIT"
    },
    "node_modules/dotenv": {
      "version": "17.4.2",
      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-17.4.2.tgz",
      "integrity": "sha512-nI4U3TottKAcAD9LLud4Cb7b2QztQMUEfHbvhTH09bqXTxnSie8WnjPALV/WMCrJZ6UV/qHJ6L03OqO3LcdYZw==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://dotenvx.com"
      }
    },
    "node_modules/eastasianwidth": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/eastasianwidth/-/eastasianwidth-0.2.0.tgz",
      "integrity": "sha512-I88TYZWc9XiYHRQ4/3c5rjjfgkjhLyW2luGIheGERbNQ6OY7yTybanSpDXZa8y7VUP9YmDcYa+eyq4ca7iLqWA==",
      "license": "MIT"
    },
    "node_modules/emoji-regex": {
      "version": "9.2.2",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-9.2.2.tgz",
      "integrity": "sha512-L18DaJsXSUk2+42pv8mLs5jJT2hqFkFE4j21wOmgbUqsZ2hL72NsUU785g9RXgo3s0ZNgVl42TiHp3ZtOv/Vyg==",
      "license": "MIT"
    },
    "node_modules/event-target-shim": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/event-target-shim/-/event-target-shim-5.0.1.tgz",
      "integrity": "sha512-i/2XbnSz/uxRCU6+NdVJgKWDTM427+MqYbkQzD321DuCQJUqOuJKIA0IM2+W2xtYHdKOmZ4dR6fExsd4SXL+WQ==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/events": {
      "version": "3.3.0",
      "resolved": "https://registry.npmjs.org/events/-/events-3.3.0.tgz",
      "integrity": "sha512-mQw+2fkQbALzQ7V0MY0IqdnXNOeTtP4r0lN9z7AAawCXgqea7bDii20AYrIBrFd/Hx0M2Ocz6S111CaFkUcb0Q==",
      "license": "MIT",
      "engines": {
        "node": ">=0.8.x"
      }
    },
    "node_modules/events-universal": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/events-universal/-/events-universal-1.0.1.tgz",
      "integrity": "sha512-LUd5euvbMLpwOF8m6ivPCbhQeSiYVNb8Vs0fQ8QjXo0JTkEHpz8pxdQf0gStltaPpw0Cca8b39KxvK9cfKRiAw==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.7.0"
      }
    },
    "node_modules/fast-deep-equal": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
      "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
      "license": "MIT"
    },
    "node_modules/fast-fifo": {
      "version": "1.3.2",
      "resolved": "https://registry.npmjs.org/fast-fifo/-/fast-fifo-1.3.2.tgz",
      "integrity": "sha512-/d9sfos4yxzpwkDkuN7k2SqFKtYNmCTzgfEpz82x34IM9/zc8KGxQoXg1liNC/izpRM/MBdt44Nmx41ZWqk+FQ==",
      "license": "MIT"
    },
    "node_modules/fontkit": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/fontkit/-/fontkit-2.0.4.tgz",
      "integrity": "sha512-syetQadaUEDNdxdugga9CpEYVaQIxOwk7GlwZWWZ19//qW4zE5bknOKeMBDYAASwnpaSHKJITRLMF9m1fp3s6g==",
      "license": "MIT",
      "dependencies": {
        "@swc/helpers": "^0.5.12",
        "brotli": "^1.3.2",
        "clone": "^2.1.2",
        "dfa": "^1.2.0",
        "fast-deep-equal": "^3.1.3",
        "restructure": "^3.0.0",
        "tiny-inflate": "^1.0.3",
        "unicode-properties": "^1.4.0",
        "unicode-trie": "^2.0.0"
      }
    },
    "node_modules/foreground-child": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/foreground-child/-/foreground-child-3.3.1.tgz",
      "integrity": "sha512-gIXjKqtFuWEgzFRJA9WCQeSJLZDjgJUOMCMzxtvFq/37KojM1BFGufqsCy0r4qSQmYLsZYMeyRqzIWOMup03sw==",
      "license": "ISC",
      "dependencies": {
        "cross-spawn": "^7.0.6",
        "signal-exit": "^4.0.1"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/glob": {
      "version": "10.5.0",
      "resolved": "https://registry.npmjs.org/glob/-/glob-10.5.0.tgz",
      "integrity": "sha512-DfXN8DfhJ7NH3Oe7cFmu3NCu1wKbkReJ8TorzSAFbSKrlNaQSKfIzqYqVY8zlbs2NLBbWpRiU52GX2PbaBVNkg==",
      "deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me",
      "license": "ISC",
      "dependencies": {
        "foreground-child": "^3.1.0",
        "jackspeak": "^3.1.2",
        "minimatch": "^9.0.4",
        "minipass": "^7.1.2",
        "package-json-from-dist": "^1.0.0",
        "path-scurry": "^1.11.1"
      },
      "bin": {
        "glob": "dist/esm/bin.mjs"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.11",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz",
      "integrity": "sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==",
      "license": "ISC"
    },
    "node_modules/iceberg-js": {
      "version": "0.8.1",
      "resolved": "https://registry.npmjs.org/iceberg-js/-/iceberg-js-0.8.1.tgz",
      "integrity": "sha512-1dhVQZXhcHje7798IVM+xoo/1ZdVfzOMIc8/rgVSijRK38EDqOJoGula9N/8ZI5RD8QTxNQtK/Gozpr+qUqRRA==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/ieee754": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/ieee754/-/ieee754-1.2.1.tgz",
      "integrity": "sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "BSD-3-Clause"
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/is-fullwidth-code-point": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz",
      "integrity": "sha512-zymm5+u+sCsSWyD9qNaejV3DFvhCKclKdizYaJUuHA83RLjb7nSuGnddCHGv0hk+KY7BMAlsWeK4Ueg6EV6XQg==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-stream": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-stream/-/is-stream-2.0.1.tgz",
      "integrity": "sha512-hFoiJiTl63nn+kstHGBtewWSKnQLpyb155KHheA1l39uvtO9nWIop1p3udqPcUd/xbF1VLMO4n7OI6p7RbngDg==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/isarray": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/isarray/-/isarray-1.0.0.tgz",
      "integrity": "sha512-VLghIWNM6ELQzo7zwmcg0NmTVyWKYjvIeM83yjp0wRDTmUnrM678fQbcKBo6n2CJEF0szoG//ytg+TKla89ALQ==",
      "license": "MIT"
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "license": "ISC"
    },
    "node_modules/jackspeak": {
      "version": "3.4.3",
      "resolved": "https://registry.npmjs.org/jackspeak/-/jackspeak-3.4.3.tgz",
      "integrity": "sha512-OGlZQpz2yfahA/Rd1Y8Cd9SIEsqvXkLVoSw/cgwhnhFMDbsQFeZYoJJ7bIZBS9BcamUW96asq/npPWugM+RQBw==",
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "@isaacs/cliui": "^8.0.2"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      },
      "optionalDependencies": {
        "@pkgjs/parseargs": "^0.11.0"
      }
    },
    "node_modules/js-md5": {
      "version": "0.8.3",
      "resolved": "https://registry.npmjs.org/js-md5/-/js-md5-0.8.3.tgz",
      "integrity": "sha512-qR0HB5uP6wCuRMrWPTrkMaev7MJZwJuuw4fnwAzRgP4J4/F8RwtodOKpGp4XpqsLBFzzgqIO42efFAyz2Et6KQ==",
      "license": "MIT"
    },
    "node_modules/lazystream": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/lazystream/-/lazystream-1.0.1.tgz",
      "integrity": "sha512-b94GiNHQNy6JNTrt5w6zNyffMrNkXZb3KTkCZJb2V1xaEGCk093vkZ2jk3tpaeP33/OiXC+WvK9AxUebnf5nbw==",
      "license": "MIT",
      "dependencies": {
        "readable-stream": "^2.0.5"
      },
      "engines": {
        "node": ">= 0.6.3"
      }
    },
    "node_modules/lazystream/node_modules/readable-stream": {
      "version": "2.3.8",
      "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-2.3.8.tgz",
      "integrity": "sha512-8p0AUk4XODgIewSi0l8Epjs+EVnWiK7NoDIEGU0HhE7+ZyY8D1IMY7odu5lRrFXGg71L15KG8QrPmum45RTtdA==",
      "license": "MIT",
      "dependencies": {
        "core-util-is": "~1.0.0",
        "inherits": "~2.0.3",
        "isarray": "~1.0.0",
        "process-nextick-args": "~2.0.0",
        "safe-buffer": "~5.1.1",
        "string_decoder": "~1.1.1",
        "util-deprecate": "~1.0.1"
      }
    },
    "node_modules/lazystream/node_modules/safe-buffer": {
      "version": "5.1.2",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.1.2.tgz",
      "integrity": "sha512-Gd2UZBJDkXlY7GbJxfsE8/nvKkUEU1G38c1siN6QP6a9PT9MmHB8GnpscSmMJSoF8LOIrt8ud/wPtojys4G6+g==",
      "license": "MIT"
    },
    "node_modules/lazystream/node_modules/string_decoder": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/string_decoder/-/string_decoder-1.1.1.tgz",
      "integrity": "sha512-n/ShnvDi6FHbbVfviro+WojiFzv+s8MPMHBczVePfUpDJLwoLT0ht1l4YwBCbi8pJAveEEdnkHyPyTP/mzRfwg==",
      "license": "MIT",
      "dependencies": {
        "safe-buffer": "~5.1.0"
      }
    },
    "node_modules/linebreak": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/linebreak/-/linebreak-1.1.0.tgz",
      "integrity": "sha512-MHp03UImeVhB7XZtjd0E4n6+3xr5Dq/9xI/5FptGk5FrbDR3zagPa2DS6U8ks/3HjbKWG9Q1M2ufOzxV2qLYSQ==",
      "license": "MIT",
      "dependencies": {
        "base64-js": "0.0.8",
        "unicode-trie": "^2.0.0"
      }
    },
    "node_modules/linebreak/node_modules/base64-js": {
      "version": "0.0.8",
      "resolved": "https://registry.npmjs.org/base64-js/-/base64-js-0.0.8.tgz",
      "integrity": "sha512-3XSA2cR/h/73EzlXXdU6YNycmYI7+kicTxks4eJg2g39biHR84slg2+des+p7iHYhbRg/udIS4TD53WabcOUkw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/lodash": {
      "version": "4.18.1",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.18.1.tgz",
      "integrity": "sha512-dMInicTPVE8d1e5otfwmmjlxkZoUpiVLwyeTdUsi/Caj/gfzzblBcCE5sRHV/AsjuCmxWrte2TNGSYuCeCq+0Q==",
      "license": "MIT"
    },
    "node_modules/lru-cache": {
      "version": "10.4.3",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-10.4.3.tgz",
      "integrity": "sha512-JNAzZcXrCt42VGLuYz0zfAzDfAvJWW6AfYlDBQyDV5DClI2m5sAmK+OIO7s59XfsRsWHp02jAJrRadPRGTt6SQ==",
      "license": "ISC"
    },
    "node_modules/minimatch": {
      "version": "9.0.9",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.9.tgz",
      "integrity": "sha512-OBwBN9AL4dqmETlpS2zasx+vTeWclWzkblfZk7KTA5j3jeOONz/tRCnZomUyvNg83wL5Zv9Ss6HMJXAgL8R2Yg==",
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.2"
      },
      "engines": {
        "node": ">=16 || 14 >=14.17"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/minipass": {
      "version": "7.1.3",
      "resolved": "https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz",
      "integrity": "sha512-tEBHqDnIoM/1rXME1zgka9g6Q2lcoCkxHLuc7ODJ5BxbP5d4c2Z5cGgtXAku59200Cx7diuHTOYfSBD8n6mm8A==",
      "license": "BlueOak-1.0.0",
      "engines": {
        "node": ">=16 || 14 >=14.17"
      }
    },
    "node_modules/normalize-path": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz",
      "integrity": "sha512-6eZs5Ls3WtCisHWp9S2GUy8dqkpGi4BVSz3GaqiE6ezub0512ESztXUwUB6C6IKbQkY2Pnb/mD4WYojCRwcwLA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/package-json-from-dist": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/package-json-from-dist/-/package-json-from-dist-1.0.1.tgz",
      "integrity": "sha512-UEZIS3/by4OC8vL3P2dTXRETpebLI2NiI5vIrjaD/5UtrkFX/tNbwjTSRAGC/+7CAo2pIcBaRgWmcBBHcsaCIw==",
      "license": "BlueOak-1.0.0"
    },
    "node_modules/pako": {
      "version": "1.0.11",
      "resolved": "https://registry.npmjs.org/pako/-/pako-1.0.11.tgz",
      "integrity": "sha512-4hLB8Py4zZce5s4yd9XzopqwVv/yGNhV1Bl8NTmCq1763HeK2+EwVTv+leGeL13Dnh2wfbqowVPXCIO0z4taYw==",
      "license": "(MIT AND Zlib)"
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-scurry": {
      "version": "1.11.1",
      "resolved": "https://registry.npmjs.org/path-scurry/-/path-scurry-1.11.1.tgz",
      "integrity": "sha512-Xa4Nw17FS9ApQFJ9umLiJS4orGjm7ZzwUrwamcGQuHSzDyth9boKDaycYdDcZDuqYATXw4HFXgaqWTctW/v1HA==",
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "lru-cache": "^10.2.0",
        "minipass": "^5.0.0 || ^6.0.2 || ^7.0.0"
      },
      "engines": {
        "node": ">=16 || 14 >=14.18"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/pdfkit": {
      "version": "0.19.1",
      "resolved": "https://registry.npmjs.org/pdfkit/-/pdfkit-0.19.1.tgz",
      "integrity": "sha512-6Gzk+wDwTs4VSxsR5rCMTnIl5nlmkye1oWB0l2hDB1EX6ZNSIBroKQEv+2+fPPn+stVjyqzmsqRJVDfB9fo5DA==",
      "license": "MIT",
      "dependencies": {
        "@noble/ciphers": "^1.0.0",
        "@noble/hashes": "^1.6.0",
        "fontkit": "^2.0.4",
        "js-md5": "^0.8.3",
        "linebreak": "^1.1.0",
        "png-js": "^1.1.0"
      }
    },
    "node_modules/png-js": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/png-js/-/png-js-1.1.0.tgz",
      "integrity": "sha512-PM/uYGzGdNSzqeOgly68+6wKQDL1SY0a/N+OEa/+br6LnHWOAJB0Npiamnodfq3jd2LS/i2fMeOKSAILjA+m5Q==",
      "dependencies": {
        "browserify-zlib": "^0.2.0"
      }
    },
    "node_modules/process": {
      "version": "0.11.10",
      "resolved": "https://registry.npmjs.org/process/-/process-0.11.10.tgz",
      "integrity": "sha512-cdGef/drWFoydD1JsMzuFf8100nZl+GT+yacc2bEced5f9Rjk4z+WtFUTBu9PhOi9j/jfmBPu0mMEY4wIdAF8A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6.0"
      }
    },
    "node_modules/process-nextick-args": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/process-nextick-args/-/process-nextick-args-2.0.1.tgz",
      "integrity": "sha512-3ouUOpQhtgrbOa17J7+uxOTpITYWaGP7/AhoR3+A+/1e9skrzelGi/dXzEYyvbxubEF6Wn2ypscTKiKJFFn1ag==",
      "license": "MIT"
    },
    "node_modules/readable-stream": {
      "version": "4.7.0",
      "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-4.7.0.tgz",
      "integrity": "sha512-oIGGmcpTLwPga8Bn6/Z75SVaH1z5dUut2ibSyAMVhmUggWpmDn2dapB0n7f8nwaSiRtepAsfJyfXIO5DCVAODg==",
      "license": "MIT",
      "dependencies": {
        "abort-controller": "^3.0.0",
        "buffer": "^6.0.3",
        "events": "^3.3.0",
        "process": "^0.11.10",
        "string_decoder": "^1.3.0"
      },
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      }
    },
    "node_modules/readdir-glob": {
      "version": "1.1.3",
      "resolved": "https://registry.npmjs.org/readdir-glob/-/readdir-glob-1.1.3.tgz",
      "integrity": "sha512-v05I2k7xN8zXvPD9N+z/uhXPaj0sUFCe2rcWZIpBsqxfP7xXFQ0tipAd/wjj1YxWyWtUS5IDJpOG82JKt2EAVA==",
      "license": "Apache-2.0",
      "dependencies": {
        "minimatch": "^5.1.0"
      }
    },
    "node_modules/readdir-glob/node_modules/minimatch": {
      "version": "5.1.9",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-5.1.9.tgz",
      "integrity": "sha512-7o1wEA2RyMP7Iu7GNba9vc0RWWGACJOCZBJX2GJWip0ikV+wcOsgVuY9uE8CPiyQhkGFSlhuSkZPavN7u1c2Fw==",
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.1"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/restructure": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/restructure/-/restructure-3.0.2.tgz",
      "integrity": "sha512-gSfoiOEA0VPE6Tukkrr7I0RBdE0s7H1eFCDBk05l1KIQT1UIKNc5JZy6jdyW6eYH3aR3g5b3PuL77rq0hvwtAw==",
      "license": "MIT"
    },
    "node_modules/safe-buffer": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/signal-exit": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz",
      "integrity": "sha512-bzyZ1e88w9O1iNJbKnOlvYTrWPDl46O1bG0D3XInv+9tkPrxrN8jUUTiFlDkkmKWgn1M6CfIA13SuGqOa9Korw==",
      "license": "ISC",
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/streamx": {
      "version": "2.28.0",
      "resolved": "https://registry.npmjs.org/streamx/-/streamx-2.28.0.tgz",
      "integrity": "sha512-1Yowhzjf0ivGMrTIkY9hav5TxobO9qIVqUE41fiCGMGgc3CLlf4MY+9AHmZqBWgDTue0fY9zWjYFVyf6Diuobw==",
      "license": "MIT",
      "dependencies": {
        "events-universal": "^1.0.0",
        "fast-fifo": "^1.3.2",
        "text-decoder": "^1.1.0"
      }
    },
    "node_modules/string_decoder": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/string_decoder/-/string_decoder-1.3.0.tgz",
      "integrity": "sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==",
      "license": "MIT",
      "dependencies": {
        "safe-buffer": "~5.2.0"
      }
    },
    "node_modules/string-width": {
      "version": "5.1.2",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-5.1.2.tgz",
      "integrity": "sha512-HnLOCR3vjcY8beoNLtcjZ5/nxn2afmME6lhrDrebokqMap+XbeW8n9TXpPDOqdGK5qcI3oT0GKTW6wC7EMiVqA==",
      "license": "MIT",
      "dependencies": {
        "eastasianwidth": "^0.2.0",
        "emoji-regex": "^9.2.2",
        "strip-ansi": "^7.0.1"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/string-width-cjs": {
      "name": "string-width",
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/string-width-cjs/node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/string-width-cjs/node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "license": "MIT"
    },
    "node_modules/string-width-cjs/node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-7.2.0.tgz",
      "integrity": "sha512-yDPMNjp4WyfYBkHnjIRLfca1i6KMyGCtsVgoKe/z1+6vukgaENdgGBZt+ZmKPc4gavvEZ5OgHfHdrazhgNyG7w==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^6.2.2"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/strip-ansi?sponsor=1"
      }
    },
    "node_modules/strip-ansi-cjs": {
      "name": "strip-ansi",
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi-cjs/node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/tar-stream": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/tar-stream/-/tar-stream-3.2.0.tgz",
      "integrity": "sha512-ojzvCvVaNp6aOTFmG7jaRD0meowIAuPc3cMMhSgKiVWws1GyHbGd/xvnyuRKcKlMpt3qvxx6r0hreCNITP9hIg==",
      "license": "MIT",
      "dependencies": {
        "b4a": "^1.6.4",
        "bare-fs": "^4.5.5",
        "fast-fifo": "^1.2.0",
        "streamx": "^2.15.0"
      }
    },
    "node_modules/teex": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/teex/-/teex-1.0.1.tgz",
      "integrity": "sha512-eYE6iEI62Ni1H8oIa7KlDU6uQBtqr4Eajni3wX7rpfXD8ysFx8z0+dri+KWEPWpBsxXfxu58x/0jvTVT1ekOSg==",
      "license": "MIT",
      "dependencies": {
        "streamx": "^2.12.5"
      }
    },
    "node_modules/text-decoder": {
      "version": "1.2.7",
      "resolved": "https://registry.npmjs.org/text-decoder/-/text-decoder-1.2.7.tgz",
      "integrity": "sha512-vlLytXkeP4xvEq2otHeJfSQIRyWxo/oZGEbXrtEEF9Hnmrdly59sUbzZ/QgyWuLYHctCHxFF4tRQZNQ9k60ExQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.6.4"
      }
    },
    "node_modules/tiny-inflate": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/tiny-inflate/-/tiny-inflate-1.0.3.tgz",
      "integrity": "sha512-pkY1fj1cKHb2seWDy0B16HeWyczlJA9/WW3u3c4z/NiWDsO3DOU5D7nhTLE9CF0yXv/QZFY7sEJmj24dK+Rrqw==",
      "license": "MIT"
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "license": "0BSD"
    },
    "node_modules/unicode-properties": {
      "version": "1.4.1",
      "resolved": "https://registry.npmjs.org/unicode-properties/-/unicode-properties-1.4.1.tgz",
      "integrity": "sha512-CLjCCLQ6UuMxWnbIylkisbRj31qxHPAurvena/0iwSVbQ2G1VY5/HjV0IRabOEbDHlzZlRdCrD4NhB0JtU40Pg==",
      "license": "MIT",
      "dependencies": {
        "base64-js": "^1.3.0",
        "unicode-trie": "^2.0.0"
      }
    },
    "node_modules/unicode-trie": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/unicode-trie/-/unicode-trie-2.0.0.tgz",
      "integrity": "sha512-x7bc76x0bm4prf1VLg79uhAzKw8DVboClSN5VxJuQ+LKDOVEW9CdH+VY7SP+vX7xCYQqzzgQpFqz15zeLvAtZQ==",
      "license": "MIT",
      "dependencies": {
        "pako": "^0.2.5",
        "tiny-inflate": "^1.0.0"
      }
    },
    "node_modules/unicode-trie/node_modules/pako": {
      "version": "0.2.9",
      "resolved": "https://registry.npmjs.org/pako/-/pako-0.2.9.tgz",
      "integrity": "sha512-NUcwaKxUxWrZLpDG+z/xZaCgQITkA/Dv4V/T6bw7VON6l1Xz/VnrBqrYjZQ12TamKHzITTfOEIYUj48y2KXImA==",
      "license": "MIT"
    },
    "node_modules/util-deprecate": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/util-deprecate/-/util-deprecate-1.0.2.tgz",
      "integrity": "sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==",
      "license": "MIT"
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/wrap-ansi": {
      "version": "8.1.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-8.1.0.tgz",
      "integrity": "sha512-si7QWI6zUMq56bESFvagtmzMdGOtoxfR+Sez11Mobfc7tm+VkUckk9bW2UeffTGVUbOksxmSw0AA2gs8g71NCQ==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^6.1.0",
        "string-width": "^5.0.1",
        "strip-ansi": "^7.0.1"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrap-ansi-cjs": {
      "name": "wrap-ansi",
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrap-ansi-cjs/node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/wrap-ansi-cjs/node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/wrap-ansi-cjs/node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "license": "MIT"
    },
    "node_modules/wrap-ansi-cjs/node_modules/string-width": {
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/wrap-ansi-cjs/node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/zip-stream": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/zip-stream/-/zip-stream-6.0.1.tgz",
      "integrity": "sha512-zK7YHHz4ZXpW89AHXUPbQVGKI7uvkd3hzusTdotCg1UxyaVtg0zFJSTfW/Dq5f7OBBVnq6cZIaC8Ti4hb6dtCA==",
      "license": "MIT",
      "dependencies": {
        "archiver-utils": "^5.0.0",
        "compress-commons": "^6.0.2",
        "readable-stream": "^4.0.0"
      },
      "engines": {
        "node": ">= 14"
      }
    }
  }
}
WACHTELAER_EOF_MARKER

mkdir -p "scripts/backup-formulieren"
cat > "scripts/backup-formulieren/run-backup.bat" <<'WACHTELAER_EOF_MARKER'
@echo off
REM Runs the backup with this .bat file's own folder as the working
REM directory, regardless of what directory Task Scheduler starts in.
cd /d "%~dp0"
node backup.js >> backup.log 2>&1
WACHTELAER_EOF_MARKER

echo "Klaar."
echo "1) Voer supabase/migrations/0014_formulieren.sql uit in de Supabase SQL editor."
echo "2) cd scripts/backup-formulieren && copy .env.example .env && npm install (zelfde SUPABASE_URL/SERVICE_ROLE_KEY als de andere backups, eigen BACKUP_DIR)."
echo "3) Plan de nieuwe backup-formulieren taak in Task Scheduler, net als de twee andere backups."
