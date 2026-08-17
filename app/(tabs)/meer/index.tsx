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
      (isMgmt ? countTeKeuren() : countInBehandeling(profile.id))
        .then((n) => {
          setVerlofSub(isMgmt ? `${n} te beoordelen` : `${profile.verlof_dagen} dagen over · ${n} in behandeling`);
        })
        .catch(() => {
          setVerlofSub(isMgmt ? '0 te beoordelen' : `${profile.verlof_dagen} dagen over · 0 in behandeling`);
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

        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Ploeg &amp; rechten</Text>
            <Text style={styles.cardBody}>Komt in de volgende fase.</Text>
          </View>
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
