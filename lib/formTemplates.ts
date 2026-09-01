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
  | 'opstart_airco'
  | 'opstart_warmtepomp';

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
      { id: 'buiten_merk', label: 'Buitenunit — merk', kind: 'tekst' },
      { id: 'buiten_type', label: 'Buitenunit — type', kind: 'tekst' },
      { id: 'buiten_serienummer', label: 'Buitenunit — serienummer', kind: 'tekst' },
      { id: 'buiten_koelmiddel', label: 'Buitenunit — koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'buiten_hoeveelheid', label: 'Buitenunit — hoeveelheid koelmiddel', kind: 'getal', eenheid: 'kg' },
      { id: 'lekcontrole', label: 'Controle op lekkage', kind: 'keuze', opties: JA_NEE },
      { id: 'buitenunit', label: 'Buitenunit gereinigd', kind: 'keuze', opties: JA_NEE },
      {
        id: 'binnenunits',
        label: 'Binnenunits (locatie/type)',
        kind: 'dynamische_lijst',
        ph: 'Bv. Living — wandmodel',
      },
      { id: 'binnenunit', label: 'Binnenunits gereinigd', kind: 'keuze', opties: JA_NEE },
      { id: 'filters', label: 'Filters', kind: 'keuze', opties: ['Gereinigd', 'Vervangen', 'N.v.t.'] },
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
      { id: 'systeem', label: 'Type systeem', kind: 'keuze', opties: ['C+ (vraaggestuurd)', 'WTW', 'Natuurlijke ventilatie', 'Mechanische afvoer', 'Balansventilatie'] },
      { id: 'filters', label: 'Filters', kind: 'keuze', opties: ['Gereinigd', 'Vervangen', 'N.v.t.'] },
      { id: 'ventilatoren', label: 'Ventilatoren gecontroleerd', kind: 'keuze', opties: JA_NEE },
      { id: 'kanalen', label: 'Kanalen gereinigd', kind: 'keuze', opties: ['Ja', 'Nee', 'N.v.t.'] },
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
    sub: 'Indienststelling van een nieuwe airco-/warmtepompinstallatie',
    velden: [
      { id: 'outdoor_merk', label: 'Outdoor — merk', kind: 'tekst' },
      { id: 'outdoor_model', label: 'Outdoor — model', kind: 'tekst' },
      { id: 'outdoor_serienummer', label: 'Outdoor — serienummer', kind: 'tekst' },
      {
        id: 'indoor_units',
        label: 'Indoor-units',
        kind: 'dynamische_groep',
        subVelden: [
          { id: 'merk', label: 'Merk' },
          { id: 'model', label: 'Model' },
          { id: 'serienummer', label: 'Serienummer' },
          { id: 'locatie', label: 'Locatie' },
        ],
      },
      { id: 'testdruk_systeem', label: 'Testdruk systeem', kind: 'getal', eenheid: 'bar' },
      { id: 'duur_vacuum', label: 'Duur vacuüm', kind: 'getal', eenheid: 'min' },
      { id: 'diameter_pers', label: 'Diameter pers', kind: 'tekst' },
      { id: 'diameter_zuig', label: 'Diameter zuig', kind: 'tekst' },
      { id: 'leidinglengte', label: 'Totale leidinglengte', kind: 'getal', eenheid: 'm' },
      { id: 'type_gas', label: 'Type gas', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'extra_vulling', label: 'Extra vulling', kind: 'getal', eenheid: 'g' },
      { id: 'werkspanning', label: 'Werkspanning', kind: 'tekst', ph: 'Bv. 230V' },
      { id: 'afzekering', label: 'Afzekering', kind: 'tekst', ph: 'Bv. 16A' },
    ],
  },
  {
    key: 'opstart_warmtepomp',
    naam: 'Opstart lucht/water warmtepomp',
    sub: 'Indienststelling van een lucht/water warmtepompinstallatie',
    velden: [
      { id: 'outdoor_merk', label: 'Buitenunit — merk', kind: 'tekst' },
      { id: 'outdoor_model', label: 'Buitenunit — model', kind: 'tekst' },
      { id: 'outdoor_serienummer', label: 'Buitenunit — serienummer', kind: 'tekst' },
      { id: 'type_systeem', label: 'Type systeem', kind: 'keuze', opties: ['Monobloc', 'Split'] },
      { id: 'indoor_merk', label: 'Binnenmodule — merk', kind: 'tekst', ph: 'N.v.t. bij monobloc' },
      { id: 'indoor_model', label: 'Binnenmodule — model', kind: 'tekst', ph: 'N.v.t. bij monobloc' },
      { id: 'vermogen', label: 'Vermogen', kind: 'getal', eenheid: 'kW' },
      { id: 'type_gas', label: 'Type koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'testdruk_systeem', label: 'Testdruk koelcircuit', kind: 'getal', eenheid: 'bar' },
      { id: 'duur_vacuum', label: 'Duur vacuüm', kind: 'getal', eenheid: 'min' },
      { id: 'leidinglengte', label: 'Leidinglengte koelcircuit', kind: 'getal', eenheid: 'm', ph: 'N.v.t. bij monobloc' },
      { id: 'extra_vulling', label: 'Extra koelmiddelvulling', kind: 'getal', eenheid: 'g', ph: 'N.v.t. bij monobloc' },
      { id: 'waterdruk', label: 'Waterdruk verwarmingscircuit', kind: 'getal', eenheid: 'bar' },
      { id: 'aanvoertemperatuur', label: 'Aanvoertemperatuur', kind: 'getal', eenheid: '°C' },
      { id: 'retourtemperatuur', label: 'Retourtemperatuur', kind: 'getal', eenheid: '°C' },
      { id: 'glycol', label: 'Glycol toegevoegd', kind: 'keuze', opties: JA_NEE },
      { id: 'buffervat', label: 'Buffervat', kind: 'keuze', opties: ['Aanwezig', 'Niet aanwezig'] },
      { id: 'type_afgifte', label: 'Type afgifte', kind: 'keuze', opties: ['Vloerverwarming', 'Radiatoren', 'Convectoren', 'Mix'] },
      { id: 'sanitair_warm_water', label: 'Sanitair warm water via warmtepomp', kind: 'keuze', opties: JA_NEE },
      { id: 'stooklijn', label: 'Stooklijn ingesteld', kind: 'keuze', opties: JA_NEE },
      { id: 'werkspanning', label: 'Werkspanning', kind: 'tekst', ph: 'Bv. 230V of 400V' },
      { id: 'afzekering', label: 'Afzekering', kind: 'tekst', ph: 'Bv. 16A' },
      { id: 'werking', label: 'Werking getest', kind: 'keuze', opties: ['Goed', 'Gebrek'] },
    ],
  },
];

export function getFormTemplate(key: string): FormTemplate {
  return FORM_TEMPLATES.find((f) => f.key === key) ?? FORM_TEMPLATES[0];
}
