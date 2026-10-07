import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextArea, TextField } from '@/components/ui/Form';
import { zoekKlant, type GevondenKlant } from '@/lib/api/outsmartKlant';
import { maakOfferteAan, type NieuweOfferte } from '@/lib/api/outsmartOfferte';
import { colors, fonts } from '@/lib/theme';

function formatBedrag(bedrag: string | undefined): string {
  const n = Number(bedrag);
  if (!bedrag || Number.isNaN(n)) return '—';
  return n.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export default function KlantenbezoekScreen() {
  const [query, setQuery] = useState('');
  const [zoekBezig, setZoekBezig] = useState(false);
  const [zoekFout, setZoekFout] = useState<string | null>(null);
  const [treffers, setTreffers] = useState<GevondenKlant[]>([]);
  const [gekozenKlant, setGekozenKlant] = useState<GevondenKlant | null>(null);

  const [omschrijving, setOmschrijving] = useState('');
  const [aanmaakBezig, setAanmaakBezig] = useState(false);
  const [aanmaakFout, setAanmaakFout] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<NieuweOfferte | null>(null);
  const [toelichting, setToelichting] = useState<string | null>(null);

  const zoeken = async () => {
    if (query.trim().length < 2) return;
    setZoekBezig(true);
    setZoekFout(null);
    setGekozenKlant(null);
    setResultaat(null);
    try {
      const klanten = await zoekKlant(query.trim());
      setTreffers(klanten);
    } catch (e: any) {
      setZoekFout(e.message ?? 'Kon niet zoeken in Outsmart');
    } finally {
      setZoekBezig(false);
    }
  };

  const aanmaken = async () => {
    if (!gekozenKlant || !omschrijving.trim()) return;
    setAanmaakBezig(true);
    setAanmaakFout(null);
    try {
      const { offerte, toelichting: t } = await maakOfferteAan({
        debtorNr: gekozenKlant.debtorNr,
        klantNaam: gekozenKlant.naam,
        omschrijving: omschrijving.trim(),
      });
      setResultaat(offerte);
      setToelichting(t);
    } catch (e: any) {
      setAanmaakFout(e.message ?? 'Offerte aanmaken mislukt');
    } finally {
      setAanmaakBezig(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker="Project · klantenbezoek" />
      <BackRow label="Terug" onPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Klantenbezoek</Text>
          <Text style={styles.subtitle}>
            Zoek de klant op in Outsmart, geef door wat er ter plaatse gevraagd wordt, en de agent maakt meteen een
            offerte aan — gebaseerd op prijszetting uit eerder aanvaarde offertes. Geen nieuwe klant aanmaken hier:
            dat moet eerst in Outsmart zelf gebeuren (Outsmart vereist een eigen klantnummer dat wij niet veilig
            kunnen verzinnen).
          </Text>
        </View>

        <View style={styles.zoekRij}>
          <View style={{ flex: 1 }}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Naam van de klant"
              onSubmitEditing={zoeken}
              returnKeyType="search"
            />
          </View>
          <Button label={zoekBezig ? '…' : 'Zoek'} onPress={zoeken} loading={zoekBezig} disabled={query.trim().length < 2} />
        </View>
        {zoekFout ? <Text style={styles.error}>{zoekFout}</Text> : null}
        {zoekBezig ? <ActivityIndicator color={colors.accent} /> : null}

        {!gekozenKlant && treffers.length > 0 ? (
          <View style={styles.treffers}>
            {treffers.map((k) => (
              <TouchableOpacity
                key={k.debtorNr}
                style={styles.treffer}
                onPress={() => setGekozenKlant(k)}
                accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={styles.trefferNaam}>{k.naam}</Text>
                  {k.adres ? <Text style={styles.trefferSub}>{k.adres}</Text> : null}
                </View>
                {k.leadFase ? <Tag label={k.leadFase} tone="neutral" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {!zoekBezig && !zoekFout && query.trim().length >= 2 && treffers.length === 0 && !gekozenKlant ? (
          <Text style={styles.empty}>Geen klant gevonden met die naam in Outsmart.</Text>
        ) : null}

        {gekozenKlant ? (
          <View style={styles.gekozen}>
            <View style={styles.gekozenTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.trefferNaam}>{gekozenKlant.naam}</Text>
                {gekozenKlant.adres ? <Text style={styles.trefferSub}>{gekozenKlant.adres}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setGekozenKlant(null)} accessibilityRole="button">
                <Text style={styles.wijzig}>wijzig</Text>
              </TouchableOpacity>
            </View>

            <FieldLabel>Wat vraagt de klant?</FieldLabel>
            <TextArea
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Bv. Nieuwe condensatieketel plaatsen, bestaande radiatoren behouden"
              numberOfLines={4}
            />
            <Button
              label={aanmaakBezig ? 'Agent maakt offerte aan…' : 'Automatisch offerte aanmaken'}
              onPress={aanmaken}
              loading={aanmaakBezig}
              disabled={!omschrijving.trim()}
            />
            {aanmaakFout ? <Text style={styles.error}>{aanmaakFout}</Text> : null}

            {resultaat ? (
              <View style={styles.resultaat}>
                <Text style={styles.resultaatTitel}>
                  Offerte {resultaat.nummer} aangemaakt ({resultaat.status})
                </Text>
                <Text style={styles.resultaatText}>
                  {formatBedrag(resultaat.bedrag)} — marge {formatBedrag(String(resultaat.margeEuro))}
                  {resultaat.margePercent !== null ? ` (${resultaat.margePercent.toFixed(0)}%)` : ''}
                </Text>
                {resultaat.regels.map((r, i) => (
                  <Text key={i} style={styles.regel}>
                    • {r.omschrijving} — {r.aantal} {r.eenheid}
                  </Text>
                ))}
                {toelichting ? <Text style={styles.toelichting}>{toelichting}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted },
  zoekRij: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  treffers: { gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  treffer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    padding: 12,
  },
  trefferNaam: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  trefferSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  gekozen: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.white,
    padding: 12,
    gap: 10,
  },
  gekozenTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  wijzig: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.accentDark, textTransform: 'uppercase' },
  resultaat: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accentPale,
    padding: 10,
    gap: 4,
  },
  resultaatTitel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  resultaatText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  regel: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  toelichting: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 4, fontStyle: 'italic' },
});
