import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { zoekKlant, type GevondenKlant } from '@/lib/api/outsmartKlant';
import { maakOfferteAan, type NieuweOfferte } from '@/lib/api/outsmartOfferte';
import { overlegMetAgent, type BezoekBericht } from '@/lib/api/outsmartBezoekOverleg';
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

  const [berichten, setBerichten] = useState<BezoekBericht[]>([]);
  const [invoer, setInvoer] = useState('');
  const [overlegBezig, setOverlegBezig] = useState(false);
  const [overlegFout, setOverlegFout] = useState<string | null>(null);
  const [klaarVoorOfferte, setKlaarVoorOfferte] = useState(false);

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

  const kiesKlant = (k: GevondenKlant) => {
    setGekozenKlant(k);
    setBerichten([]);
    setInvoer('');
    setKlaarVoorOfferte(false);
    setResultaat(null);
    setOverlegFout(null);
  };

  const verstuurBericht = async () => {
    if (!gekozenKlant || !invoer.trim()) return;
    const nieuweBerichten: BezoekBericht[] = [...berichten, { rol: 'gebruiker', tekst: invoer.trim() }];
    setBerichten(nieuweBerichten);
    setInvoer('');
    setOverlegBezig(true);
    setOverlegFout(null);
    try {
      const antwoord = await overlegMetAgent(gekozenKlant.naam, nieuweBerichten);
      setBerichten([...nieuweBerichten, { rol: 'agent', tekst: antwoord.tekst }]);
      setKlaarVoorOfferte(antwoord.status === 'klaar');
    } catch (e: any) {
      setOverlegFout(e.message ?? 'Overleg met de agent mislukt');
    } finally {
      setOverlegBezig(false);
    }
  };

  const aanmaken = async () => {
    if (!gekozenKlant || berichten.length === 0) return;
    setAanmaakBezig(true);
    setAanmaakFout(null);
    try {
      const omschrijving = berichten
        .map((b) => `${b.rol === 'gebruiker' ? 'Installateur' : 'Agent'}: ${b.tekst}`)
        .join('\n');
      const { offerte, toelichting: t } = await maakOfferteAan({
        debtorNr: gekozenKlant.debtorNr,
        klantNaam: gekozenKlant.naam,
        omschrijving,
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
                onPress={() => kiesKlant(k)}
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

            {berichten.length === 0 ? (
              <Text style={styles.chatHint}>
                Beschrijf wat je ziet ter plaatse — de agent zegt erbij wat hij nog moet weten.
              </Text>
            ) : null}

            {berichten.length > 0 ? (
              <View style={styles.chat}>
                {berichten.map((b, i) => (
                  <View key={i} style={[styles.bubbelRij, b.rol === 'gebruiker' && styles.bubbelRijJij]}>
                    <View style={[styles.bubbel, b.rol === 'agent' ? styles.bubbelAgent : styles.bubbelJij]}>
                      {b.rol === 'agent' ? <Text style={styles.bubbelLabel}>Agent</Text> : null}
                      <Text style={[styles.bubbelText, b.rol === 'gebruiker' && styles.bubbelTextJij]}>{b.tekst}</Text>
                    </View>
                  </View>
                ))}
                {overlegBezig ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} /> : null}
              </View>
            ) : null}

            <View style={styles.zoekRij}>
              <View style={{ flex: 1 }}>
                <TextField
                  value={invoer}
                  onChangeText={setInvoer}
                  placeholder="Typ je antwoord…"
                  onSubmitEditing={verstuurBericht}
                  returnKeyType="send"
                  editable={!overlegBezig}
                />
              </View>
              <Button label="Stuur" onPress={verstuurBericht} loading={overlegBezig} disabled={!invoer.trim()} />
            </View>
            {overlegFout ? <Text style={styles.error}>{overlegFout}</Text> : null}

            {klaarVoorOfferte ? (
              <Button
                label={aanmaakBezig ? 'Agent maakt offerte aan…' : 'Agent heeft genoeg info — offerte aanmaken'}
                onPress={aanmaken}
                loading={aanmaakBezig}
              />
            ) : berichten.length > 0 && !overlegBezig ? (
              <Button
                label={aanmaakBezig ? 'Agent maakt offerte aan…' : 'Toch al offerte aanmaken met wat ik nu heb'}
                variant="secondary"
                onPress={aanmaken}
                loading={aanmaakBezig}
              />
            ) : null}
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
  chatHint: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, fontStyle: 'italic' },
  chat: { gap: 8 },
  bubbelRij: { flexDirection: 'row' },
  bubbelRijJij: { justifyContent: 'flex-end' },
  bubbel: { maxWidth: '85%', padding: 9, gap: 2 },
  bubbelAgent: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accentPale,
    borderStyle: 'dashed',
  },
  bubbelJij: { backgroundColor: colors.accent },
  bubbelLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.accentDark,
  },
  bubbelText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18 },
  bubbelTextJij: { color: colors.white },
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
