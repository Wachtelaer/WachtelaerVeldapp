#!/usr/bin/env bash
set -euo pipefail

echo "Wachtelaer Veldapp - Onderhoud airco: buitenunit-velden + dynamische binnenunits toepassen..."

mkdir -p "components/ui"
cat > "components/ui/Form.tsx" <<'WACHTELAER_EOF_MARKER'
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function TextField(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkFaint} style={styles.input} {...props} />;
}

export function TextArea(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkFaint}
      multiline
      textAlignVertical="top"
      style={[styles.input, styles.textArea]}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentedOption,
              i > 0 && styles.segmentedOptionBorder,
              active && styles.segmentedOptionActive,
            ]}
            accessibilityRole="button">
            <Text style={[styles.segmentedLabel, active && styles.segmentedLabelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  eenheid,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  eenheid: string;
  min?: number;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityRole="button">
          <Ionicons name="remove" size={18} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, styles.stepperBtnRight]}
          onPress={() => onChange(value + 1)}
          accessibilityRole="button">
          <Ionicons name="add" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={styles.eenheid}>{eenheid}</Text>
    </View>
  );
}

/** A typed-in number, for values too large/precise to comfortably tap out with a Stepper. */
export function NumberField({
  value,
  onChangeText,
  eenheid,
}: {
  value: string;
  onChangeText: (v: string) => void;
  eenheid: string;
}) {
  return (
    <View style={styles.numberFieldRow}>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9.,]/g, ''))}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, styles.numberFieldInput]}
      />
      <Text style={styles.eenheid}>{eenheid}</Text>
    </View>
  );
}

/** One NumberField per item — e.g. an oppervlakte input per room, count
 *  driven by another field's value ("aantal ruimtes"). */
export function NumberFieldList({
  count,
  values,
  onChange,
  eenheid,
  itemLabel,
}: {
  count: number;
  values: string[];
  onChange: (values: string[]) => void;
  eenheid: string;
  itemLabel: (index: number) => string;
}) {
  if (count <= 0) {
    return <Text style={styles.numberFieldListHint}>Vul eerst het aantal in.</Text>;
  }
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.numberFieldListRow}>
          <Text style={styles.numberFieldListLabel}>{itemLabel(i)}</Text>
          <NumberField
            value={values[i] ?? ''}
            onChangeText={(v) => {
              const next = [...values];
              next[i] = v;
              onChange(next);
            }}
            eenheid={eenheid}
          />
        </View>
      ))}
    </View>
  );
}

/** A growing list of free-text lines — starts with one empty line, adds a
 *  new empty one below as soon as the last line gets text, and lets you
 *  remove a line. E.g. one binnenunit per line, no fixed count needed. */
export function DynamicTextList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const regels = values.length ? values : [''];

  const updateRegel = (index: number, waarde: string) => {
    const next = regels.map((r, i) => (i === index ? waarde : r));
    if (next[next.length - 1].trim()) next.push('');
    onChange(next);
  };

  const removeRegel = (index: number) => {
    const next = regels.filter((_, i) => i !== index);
    onChange(next.length ? next : ['']);
  };

  return (
    <View style={{ gap: 8 }}>
      {regels.map((regel, i) => (
        <View key={i} style={styles.dynamicRow}>
          <View style={{ flex: 1 }}>
            <TextField value={regel} onChangeText={(v) => updateRegel(i, v)} placeholder={placeholder} />
          </View>
          {regels.length > 1 ? (
            <TouchableOpacity onPress={() => removeRegel(i)} accessibilityRole="button" style={styles.dynamicRemove}>
              <Ionicons name="close" size={16} color={colors.inkMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Wrapped pill buttons — single-select (like a radio group) or multi-select (like checkboxes). */
export function ChipGroup({
  opties,
  value,
  onChange,
  multi = false,
}: {
  opties: string[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chipGroup}>
      {opties.map((opt) => {
        const active = multi ? Array.isArray(value) && value.includes(opt) : value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => {
              if (multi) {
                const arr = Array.isArray(value) ? value : [];
                onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
              } else {
                onChange(opt);
              }
            }}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button">
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ToggleRow({
  checked,
  onToggle,
  titel,
  sub,
}: {
  checked: boolean;
  onToggle: () => void;
  titel: string;
  sub: string;
}) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} accessibilityRole="button">
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitel}>{titel}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 7,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  textArea: { minHeight: 76, paddingTop: 10 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: colors.dividerStrong },
  segmentedOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentedOptionBorder: { borderLeftWidth: 1, borderLeftColor: colors.dividerStrong },
  segmentedOptionActive: { backgroundColor: colors.accent },
  segmentedLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  segmentedLabelActive: { color: colors.white },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberFieldInput: { flex: 1 },
  numberFieldListHint: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, fontStyle: 'italic' },
  numberFieldListRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numberFieldListLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkMuted, width: 76 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.dividerStrong },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.dividerStrong },
  stepperBtnRight: { borderRightWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.dividerStrong },
  stepperValue: { minWidth: 44, textAlign: 'center', fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
  eenheid: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkMuted },
  dynamicRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dynamicRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.dividerStrong },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  chipLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  chipLabelActive: { color: colors.white },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.dividerStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  toggleTitel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  toggleSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted },
});
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/salesModules.ts" <<'WACHTELAER_EOF_MARKER'
// Ported from the MODULES config in project/Wachtelaer Veldapp.dc.html —
// one short questionnaire per domain, capturing only what the backoffice
// needs to build a quote. Deliberately no prices: the verkoper measures,
// the backoffice quotes.

export type ModuleKey = 'verwarming' | 'airco' | 'zon' | 'sanitair' | 'ventilatie';
export type VeldKind = 'keuze' | 'num' | 'getal' | 'tekst' | 'chips' | 'lijst' | 'datum' | 'dynamische_lijst';

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
      if (v.kind === 'dynamische_lijst') {
        const arr = Array.isArray(w) ? (w as string[]) : [];
        return !arr.some((x) => x && x.trim());
      }
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
      { id: 'buiten_merk', label: 'Buitenunit — merk', kind: 'tekst' },
      { id: 'buiten_type', label: 'Buitenunit — type', kind: 'tekst' },
      { id: 'buiten_serienummer', label: 'Buitenunit — serienummer', kind: 'tekst' },
      { id: 'buiten_koelmiddel', label: 'Buitenunit — koelmiddel', kind: 'keuze', opties: KOELMIDDEL_OPTIES },
      { id: 'buiten_hoeveelheid', label: 'Buitenunit — hoeveelheid koelmiddel', kind: 'getal', eenheid: 'kg' },
      { id: 'druk', label: 'Gemeten druk', kind: 'getal', eenheid: 'bar' },
      { id: 'filters', label: 'Filters', kind: 'keuze', opties: ['Gereinigd', 'Vervangen', 'N.v.t.'] },
      { id: 'buitenunit', label: 'Buitenunit gereinigd', kind: 'keuze', opties: JA_NEE },
      {
        id: 'binnenunits',
        label: 'Binnenunits (locatie/type)',
        kind: 'dynamische_lijst',
        ph: 'Bv. Living — wandmodel',
      },
      { id: 'binnenunit', label: 'Binnenunits gereinigd', kind: 'keuze', opties: JA_NEE },
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

mkdir -p "app/(tabs)/meer/formulieren"
cat > "app/(tabs)/meer/formulieren/[form].tsx" <<'WACHTELAER_EOF_MARKER'
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, DynamicTextList, FieldLabel, NumberField, TextArea, TextField } from '@/components/ui/Form';
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
            {v.kind === 'dynamische_lijst' ? (
              <DynamicTextList
                values={(antwoorden[v.id] as string[]) || []}
                onChange={(vals) => setVeld(v.id, vals)}
                placeholder={v.ph}
              />
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
    buiten_merk: { label: 'Buitenunit — merk' },
    buiten_type: { label: 'Buitenunit — type' },
    buiten_serienummer: { label: 'Buitenunit — serienummer' },
    buiten_koelmiddel: { label: 'Buitenunit — koelmiddel' },
    buiten_hoeveelheid: { label: 'Buitenunit — hoeveelheid koelmiddel', eenheid: 'kg' },
    druk: { label: 'Gemeten druk', eenheid: 'bar' },
    filters: { label: 'Filters' },
    buitenunit: { label: 'Buitenunit gereinigd' },
    binnenunits: { label: 'Binnenunits (locatie/type)' },
    binnenunit: { label: 'Binnenunits gereinigd' },
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

echo "Klaar. Geen SQL-stap nodig voor deze update."
