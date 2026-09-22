import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listGearchiveerdeWerven, setWerfGearchiveerd } from '@/lib/api/werven';
import type { Werf } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

type GearchiveerdeWerf = Pick<Werf, 'id' | 'code' | 'naam' | 'adres' | 'fase'>;

export default function WervenArchiefScreen() {
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';
  const [werven, setWerven] = useState<GearchiveerdeWerf[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setWerven(await listGearchiveerdeWerven());
    } catch (e: any) {
      setError(e.message ?? 'Kon archief niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const herstel = async (w: GearchiveerdeWerf) => {
    setBusyId(w.id);
    try {
      await setWerfGearchiveerd(w.id, false);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon werf niet herstellen');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker="Werven · archief" />
      <BackRow label="Werven" onPress={() => router.replace('/werven')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Archief</Text>
          <Text style={styles.subtitle}>Gearchiveerde werven — enkel zichtbaar voor management. Alle gegevens blijven bewaard.</Text>
        </View>

        {!isMgmt ? <Text style={styles.error}>Enkel management kan het archief bekijken.</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {werven === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {werven?.length === 0 ? <Text style={styles.empty}>Geen gearchiveerde werven.</Text> : null}

        {werven && werven.length > 0 ? (
          <View>
            <SectionLabel>Gearchiveerd</SectionLabel>
            {werven.map((w) => (
              <View key={w.id} style={styles.card}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/werven/${w.id}`)}
                  accessibilityRole="button">
                  <Text style={styles.cardName} numberOfLines={1}>
                    {w.naam}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {w.code} · {w.adres}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.herstelBtn}
                  onPress={() => herstel(w)}
                  disabled={busyId === w.id}
                  accessibilityRole="button">
                  {busyId === w.id ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Text style={styles.herstelBtnText}>Herstel</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardName: { fontFamily: fonts.heading, fontSize: 15, textTransform: 'uppercase', color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  herstelBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  herstelBtnText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.accentDark },
});
