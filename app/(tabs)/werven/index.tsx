import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { listWervenWithSummary, type WerfListItem } from '@/lib/api/werven';
import { colors, fonts, roleLabels } from '@/lib/theme';

export default function WervenHomeScreen() {
  const { profile } = useAuth();
  const [werven, setWerven] = useState<WerfListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      const data = await listWervenWithSummary(profile.id);
      setWerven(data);
    } catch (e: any) {
      setError(e.message ?? 'Kon werven niet laden');
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isMgmt = profile?.role === 'mgmt';
  const isWerfleider = profile?.role === 'werfleider';
  const eigenWerven = (werven ?? []).filter((w) => w.isLeider);
  const knelpunten = (werven ?? []).filter((w) => w.laatsteRapport?.knelpunt?.trim()).length;

  return (
    <View style={styles.root}>
      <AppHeader
        kicker={profile ? `${roleLabels[profile.role]} · ${(werven ?? []).length} werven` : ''}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{isMgmt ? 'Overzicht' : 'Werven'}</Text>
        </View>

        {werven === null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isMgmt && werven ? (
          <View style={styles.kpiRow}>
            <KpiTile value={String(werven.length)} label="werven actief" />
            <KpiTile value={String(knelpunten)} label="knelpunten open" />
            <KpiTile value={String(werven.reduce((n, w) => n + w.rapportCount, 0))} label="rapporten totaal" />
          </View>
        ) : null}

        {isWerfleider && eigenWerven.length === 1 ? (
          <Button
            label="Werfrapport van vandaag"
            onPress={() => router.push(`/werven/${eigenWerven[0].id}/nieuw`)}
          />
        ) : null}

        {werven && werven.length > 0 ? (
          <View>
            <SectionLabel>Werven</SectionLabel>
            {werven.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={styles.card}
                onPress={() => router.push(`/werven/${w.id}`)}
                accessibilityRole="button">
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {w.naam}
                  </Text>
                  <Text style={styles.cardFase}>{w.fase}</Text>
                </View>
                <Text style={styles.cardMeta} numberOfLines={2}>
                  {w.laatsteRapport
                    ? `Rapport ${formatDatum(w.laatsteRapport.datum)} — ${w.laatsteRapport.uitgevoerd || w.laatsteRapport.knelpunt || '—'}`
                    : 'Nog geen rapport'}
                </Text>
                <View style={styles.tagRow}>
                  <Tag label={`${w.fotoCount} foto's`} />
                  <Tag label={`${w.rapportCount} rapporten`} />
                  {w.laatsteRapport?.knelpunt?.trim() ? <Tag label="knelpunt" tone="accent" /> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {werven && werven.length === 0 ? (
          <Text style={styles.empty}>Je bent nog aan geen enkele werf toegewezen.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatDatum(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  titleRow: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 8 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  error: { fontFamily: fonts.body, color: colors.danger },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: 12,
    marginBottom: 8,
    gap: 7,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardName: { fontFamily: fonts.heading, fontSize: 17, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardFase: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accentDark },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
});
