// Ported from the MODULES config in project/Wachtelaer Veldapp.dc.html —
// one short questionnaire per domain, capturing only what the backoffice
// needs to build a quote. Deliberately no prices: the verkoper measures,
// the backoffice quotes.

export type ModuleKey = 'verwarming' | 'airco' | 'zon' | 'sanitair' | 'ventilatie';
export type VeldKind = 'keuze' | 'num' | 'getal' | 'tekst' | 'chips' | 'lijst';

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

/** Which fields are still empty, in the same order as the module's questionnaire. */
export function missingVelden(mod: SalesModule, antwoorden: Record<string, unknown>): string[] {
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
