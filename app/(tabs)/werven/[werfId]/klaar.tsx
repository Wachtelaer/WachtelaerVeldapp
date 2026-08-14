import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { colors, fonts } from '@/lib/theme';

export default function RapportKlaarScreen() {
  const { werfId, offline, deelMgmt, deelWerf, deelKlant, fotoAantal, werfNaam } = useLocalSearchParams<{
    werfId: string;
    offline: string;
    deelMgmt: string;
    deelWerf: string;
    deelKlant: string;
    fotoAantal: string;
    werfNaam: string;
  }>();

  const isOffline = offline === '1';
  const fotos = Number(fotoAantal ?? '0');

  const routing = [
    { k: 'Management', on: deelMgmt === '1' },
    { k: `Ploeg ${werfNaam ?? ''}`.trim(), on: deelWerf === '1' },
    { k: 'Klant / architect', on: deelKlant === '1' },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={28} color={colors.accentDark} />
      </View>
      <Text style={styles.title}>{isOffline ? 'Opgeslagen op toestel' : 'Rapport gedeeld'}</Text>
      <Text style={styles.tekst}>
        {isOffline
          ? 'Zodra je verbinding hebt gaat het rapport automatisch weg, met de foto\'s erbij.'
          : `Gedeeld met wie je koos, met ${fotos} foto's. Reacties komen in dezelfde lijn terecht.`}
      </Text>

      <View style={styles.card}>
        <SectionLabel>Zichtbaar voor</SectionLabel>
        {routing.map((r) => (
          <View key={r.k} style={styles.routingRow}>
            <Text style={styles.routingKey}>{r.k}</Text>
            <Text style={styles.routingVal}>{r.on ? (isOffline ? 'wachtrij' : 'gedeeld') : 'niet gedeeld'}</Text>
          </View>
        ))}
      </View>

      <Button label="Naar de werf" variant="secondary" onPress={() => router.replace(`/werven/${werfId}`)} />
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
  routingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  routingKey: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  routingVal: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.accentDark },
});
