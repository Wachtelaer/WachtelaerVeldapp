import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { colors, fonts, roleLabels } from '@/lib/theme';

export default function MeerTab() {
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.root}>
      <AppHeader kicker="Instellingen" />
      <View style={styles.body}>
        <View>
          <SectionLabel>Aangemeld als</SectionLabel>
          <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.role}>{profile ? roleLabels[profile.role] : ''}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Verlofaanvragen</Text>
          <Text style={styles.cardBody}>Komt in de volgende fase.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ploeg &amp; rechten</Text>
          <Text style={styles.cardBody}>Komt in de volgende fase.</Text>
        </View>
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
  card: { borderWidth: 1, borderColor: colors.divider, padding: 14, gap: 4 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
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
