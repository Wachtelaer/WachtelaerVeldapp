import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { colors, fonts } from '@/lib/theme';

export default function OpmetingKlaarScreen() {
  const { offline, modNaam, klantNaam } = useLocalSearchParams<{
    offline: string;
    modNaam: string;
    klantNaam: string;
  }>();
  const isOffline = offline === '1';

  const routing = [
    { k: `Backoffice — offerte ${(modNaam ?? '').toLowerCase()}`, v: isOffline ? 'wachtrij' : 'aangemaakt' },
    { k: `Klantdossier ${klantNaam ?? ''}`, v: isOffline ? 'wachtrij' : 'bijgewerkt' },
    { k: 'Jij — opvolging', v: 'herinnering na 5 dagen' },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={28} color={colors.accentDark} />
      </View>
      <Text style={styles.title}>{isOffline ? 'Opgeslagen op toestel' : 'Opmeting doorgestuurd'}</Text>
      <Text style={styles.tekst}>
        {isOffline
          ? 'Zodra je verbinding hebt gaat de opmeting met foto\'s naar de backoffice.'
          : `De backoffice heeft alle gegevens van ${(modNaam ?? '').toLowerCase()}. Je ziet de status bij je opmetingen.`}
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

      <Button label="Naar mijn opmetingen" variant="secondary" onPress={() => router.replace('/werven')} />
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
