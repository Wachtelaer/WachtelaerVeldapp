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
