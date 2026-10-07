import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { listDossiers, type Dossier } from '@/lib/api/outsmartPipeline';
import { colors, fonts } from '@/lib/theme';

function formatBedrag(bedrag: string | undefined): string {
  const n = Number(bedrag);
  if (!bedrag || Number.isNaN(n)) return '—';
  return n.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DossierCard({ dossier }: { dossier: Dossier }) {
  const laatsteOfferte = dossier.offertes[0];
  const facturatieTotaal = dossier.facturen.reduce((sum, f) => sum + (Number(f.bedrag) || 0), 0);
  const isGefactureerd = dossier.facturen.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitel} numberOfLines={1}>
          {dossier.klantNaam || dossier.naam || '(naam ontbreekt)'}
        </Text>
        {dossier.fase ? <Tag label={dossier.fase} tone="accent" /> : null}
      </View>
      {dossier.adres ? <Text style={styles.cardAdres}>{dossier.adres}</Text> : null}

      <View style={styles.stappenRow}>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Offerte</Text>
          <Text style={styles.stapWaarde}>{laatsteOfferte ? formatBedrag(laatsteOfferte.bedrag) : '—'}</Text>
          <Text style={styles.stapSub}>{laatsteOfferte ? formatDatum(laatsteOfferte.datumAanvaard) : 'geen offerte'}</Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Werf</Text>
          <Text style={styles.stapWaarde}>{dossier.fase || '—'}</Text>
          <Text style={styles.stapSub}>
            {dossier.periodeStart ? `${formatDatum(dossier.periodeStart)} – ${formatDatum(dossier.periodeEind)}` : '—'}
          </Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Facturatie</Text>
          <Text style={styles.stapWaarde}>{isGefactureerd ? formatBedrag(String(facturatieTotaal)) : '—'}</Text>
          <Text style={styles.stapSub}>
            {isGefactureerd ? `${dossier.facturen.length} factu(u)r(en)` : 'nog niet gefactureerd'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ProjectScreen() {
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setDossiers(await listDossiers());
    } catch (e: any) {
      setError(e.message ?? 'Kon dossiers niet laden');
    }
  }, []);

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

  const gefactureerd = (dossiers ?? []).filter((d) => d.facturen.length > 0).length;

  return (
    <View style={styles.root}>
      <AppHeader kicker="Project · enkel zichtbaar voor jou" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <Text style={styles.title}>Pipeline</Text>
          <Text style={styles.subtitle}>
            Live uit Outsmart: offerte → werf → facturatie, per actief dossier. Afspraak, opmeting, bestelling en
            werkbon volgen nog — die stap-voor-stap-automatisering bouwen we hierna verder uit.
          </Text>
        </View>

        {dossiers ? (
          <View style={styles.kpiRow}>
            <KpiTile value={String(dossiers.length)} label="actieve dossiers" />
            <KpiTile value={String(gefactureerd)} label="gefactureerd" />
            <KpiTile value={String(dossiers.length - gefactureerd)} label="nog te factureren" />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {dossiers === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {dossiers?.length === 0 ? <Text style={styles.empty}>Geen actieve dossiers gevonden in Outsmart.</Text> : null}

        {dossiers && dossiers.length > 0 ? (
          <View>
            <SectionLabel>Dossiers</SectionLabel>
            {dossiers.map((d) => (
              <DossierCard key={d.id} dossier={d} />
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
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 10, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardAdres: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: -4 },
  stappenRow: { flexDirection: 'row', gap: 8 },
  stap: { flex: 1, gap: 2 },
  stapLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  stapWaarde: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  stapSub: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
});
