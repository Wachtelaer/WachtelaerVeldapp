import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/Button';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listBestellijst, type BestellijstItem } from '@/lib/api/outsmartBestellingen';
import { exporteerAlsPdf } from '@/lib/pdfExport';
import { colors, fonts } from '@/lib/theme';

function formatAantal(n: number, eenheid: string): string {
  const afgerond = Math.round(n * 100) / 100;
  return `${afgerond}${eenheid ? ` ${eenheid}` : ''}`;
}

function formatDatum(iso: string | null): string {
  if (!iso) return 'nog geen werf gepland';
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bouwBestellijstHtml(items: BestellijstItem[]): string {
  const rij = (item: BestellijstItem) => `
    <tr>
      <td>
        <strong>${escapeHtml(item.omschrijving)}</strong><br/>
        <span style="color:#6a6768;font-size:8.5px;">${escapeHtml(item.materiaalCode)}</span>
        <div class="offertes">${item.offertes
          .map((o) => `${escapeHtml(o.offerteNummer)} — ${escapeHtml(o.klantNaam || '(klant onbekend)')} (${formatAantal(o.aantal, item.eenheid)})`)
          .join('<br/>')}</div>
      </td>
      <td>${formatAantal(item.totaalNodig, item.eenheid)}</td>
      <td>${formatAantal(item.voorradig, item.eenheid)}</td>
      <td class="${item.opVoorraad ? '' : 'negatief'}">${formatAantal(Math.abs(item.tekort), item.eenheid)}</td>
      <td>${formatDatum(item.vroegsteDatum)}</td>
      <td><span class="tag ${item.opVoorraad ? '' : 'tag-bestellen'}">${item.opVoorraad ? 'Op voorraad' : 'Bestellen'}</span></td>
    </tr>`;

  const tabel = (titel: string, rijen: BestellijstItem[]) =>
    rijen.length === 0
      ? ''
      : `<div class="sectie-titel">${titel}</div>
         <table>
           <thead><tr><th>Materiaal</th><th>Nodig</th><th>Voorradig</th><th>Tekort</th><th>Vroegste uitvoering</th><th>Status</th></tr></thead>
           <tbody>${rijen.map(rij).join('')}</tbody>
         </table>`;

  const teBestellen = items.filter((i) => !i.opVoorraad);
  const opVoorraad = items.filter((i) => i.opVoorraad);
  return tabel('Moet besteld worden', teBestellen) + tabel('Op voorraad', opVoorraad);
}

function BestellijstCard({ item }: { item: BestellijstItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitel} numberOfLines={2}>
          {item.omschrijving}
        </Text>
        <Tag label={item.opVoorraad ? 'Op voorraad' : 'Bestellen'} tone={item.opVoorraad ? 'neutral' : 'accent'} />
      </View>
      <Text style={styles.cardCode}>{item.materiaalCode}</Text>

      <View style={styles.stappenRow}>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Nodig</Text>
          <Text style={styles.stapWaarde}>{formatAantal(item.totaalNodig, item.eenheid)}</Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Voorradig (Bodtkaai 25)</Text>
          <Text style={styles.stapWaarde}>{formatAantal(item.voorradig, item.eenheid)}</Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>{item.opVoorraad ? 'Overschot' : 'Tekort'}</Text>
          <Text style={[styles.stapWaarde, !item.opVoorraad && styles.stapWaardeNegatief]}>
            {formatAantal(Math.abs(item.tekort), item.eenheid)}
          </Text>
        </View>
      </View>

      <Text style={styles.wanneer}>Vroegste uitvoering: {formatDatum(item.vroegsteDatum)}</Text>

      <View style={styles.offertesLijst}>
        {item.offertes.map((o, i) => (
          <View key={`${o.offerteNummer}-${i}`} style={styles.offerteRow}>
            <Text style={styles.offerteTekst} numberOfLines={1}>
              {o.offerteNummer} — {o.klantNaam || '(klant onbekend)'}
            </Text>
            <Text style={styles.offerteAantal}>{formatAantal(o.aantal, item.eenheid)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BestellingenScreen() {
  const { profile } = useAuth();
  const [bestellijst, setBestellijst] = useState<BestellijstItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exportBezig, setExportBezig] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setBestellijst(await listBestellijst());
    } catch (e: any) {
      setError(e.message ?? 'Kon bestellijst niet laden');
    }
  }, [profile]);

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

  const downloadPdf = async () => {
    if (!bestellijst || bestellijst.length === 0) return;
    setExportBezig(true);
    setExportError(null);
    try {
      await exporteerAlsPdf({
        titel: 'Bestellijst',
        ondertitel: `Op basis van aanvaarde offertes — ${new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        lichaamHtml: bouwBestellijstHtml(bestellijst),
      });
    } catch (e: any) {
      setExportError(e.message ?? 'PDF aanmaken mislukt');
    } finally {
      setExportBezig(false);
    }
  };

  const teBestellen = (bestellijst ?? []).filter((b) => !b.opVoorraad);
  const opVoorraad = (bestellijst ?? []).filter((b) => b.opVoorraad);

  return (
    <View style={styles.root}>
      <AppHeader kicker="Bestellingen · enkel zichtbaar voor jou" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <Text style={styles.title}>Bestellingen</Text>
          <Text style={styles.subtitle}>
            Materiaal uit aanvaarde offertes (nog niet uitgevoerd), gekruist met de voorraad in magazijn Bodtkaai
            25 — gesorteerd op vroegste uitvoeringsdatum. Een project-koppeling is een losse tekstuele match, geen
            harde link, dus controleer de datum bij twijfel.
          </Text>
        </View>

        {bestellijst ? (
          <View style={styles.kpiRow}>
            <KpiTile value={String(teBestellen.length)} label="moet besteld worden" />
            <KpiTile value={String(opVoorraad.length)} label="op voorraad" />
            <KpiTile value={String(bestellijst.length)} label="artikelen totaal" />
          </View>
        ) : null}

        {bestellijst && bestellijst.length > 0 ? (
          <Button
            label={exportBezig ? 'PDF aanmaken…' : 'Download als PDF'}
            variant="secondary"
            onPress={downloadPdf}
            loading={exportBezig}
          />
        ) : null}
        {exportError ? <Text style={styles.error}>{exportError}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {bestellijst === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {bestellijst?.length === 0 ? (
          <Text style={styles.empty}>Geen materiaal gevonden in aanvaarde offertes.</Text>
        ) : null}

        {teBestellen.length > 0 ? (
          <View>
            <SectionLabel>Moet besteld worden</SectionLabel>
            {teBestellen.map((item) => (
              <BestellijstCard key={item.materiaalCode} item={item} />
            ))}
          </View>
        ) : null}

        {opVoorraad.length > 0 ? (
          <View>
            <SectionLabel>Op voorraad</SectionLabel>
            {opVoorraad.map((item) => (
              <BestellijstCard key={item.materiaalCode} item={item} />
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 15, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardCode: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted, marginTop: -6 },
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
  stapWaardeNegatief: { color: colors.danger },
  wanneer: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  offertesLijst: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
    gap: 4,
  },
  offerteRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  offerteTekst: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.ink },
  offerteAantal: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accentDark },
});
