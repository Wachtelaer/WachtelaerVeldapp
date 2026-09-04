import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { ChipGroup } from '@/components/ui/Form';
import { listGoedgekeurdeOffertes, type GoedgekeurdeOfferte } from '@/lib/api/outsmart';
import { colors, fonts } from '@/lib/theme';

const ALLE = 'Alle';

export default function PlanningScreen() {
  const [offertes, setOffertes] = useState<GoedgekeurdeOfferte[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(ALLE);

  const load = useCallback(async () => {
    try {
      setError(null);
      setOffertes(await listGoedgekeurdeOffertes());
    } catch (e: any) {
      setError(e.message ?? 'Kon offertes niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const substatussen = Array.from(
    new Set((offertes ?? []).map((o) => (o.substatus ? stripHtml(o.substatus) : null)).filter((s): s is string => !!s))
  ).sort();
  const gefilterd = (offertes ?? []).filter((o) => filter === ALLE || (o.substatus && stripHtml(o.substatus) === filter));

  return (
    <View style={styles.root}>
      <AppHeader kicker="Planning" />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Planning</Text>
          <Text style={styles.subtitle}>Goedgekeurde offertes uit Outsmart.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {offertes === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}

        {substatussen.length > 0 ? <ChipGroup opties={[ALLE, ...substatussen]} value={filter} onChange={(v) => setFilter(v as string)} /> : null}

        {offertes?.length === 0 ? <Text style={styles.empty}>Geen goedgekeurde offertes gevonden.</Text> : null}
        {offertes && offertes.length > 0 && gefilterd.length === 0 ? (
          <Text style={styles.empty}>Geen offertes met deze status.</Text>
        ) : null}

        {gefilterd.map((o) => (
          <View key={o.id} style={styles.card}>
            <Text style={styles.klant} numberOfLines={1}>
              {o.klantNaam}
            </Text>
            {o.adres ? <Text style={styles.adres}>{o.adres}</Text> : null}
            {o.omschrijving ? <Text style={styles.omschrijving}>{stripHtml(o.omschrijving)}</Text> : null}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{`${o.nummer} · goedgekeurd ${formatDatum(o.datumAanvaard)}`}</Text>
              {o.substatus ? <Text style={styles.substatus}>{stripHtml(o.substatus)}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function formatDatum(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Outsmart's own text fields (description, custom substatus labels, ...)
 *  sometimes carry raw HTML (<p>, <br>) from a rich-text field on their
 *  side — render as plain text instead of showing the tags literally. */
function stripHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p>/gi, ' ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: -4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    borderStyle: 'dashed',
    padding: 14,
  },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 5 },
  klant: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  adres: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  omschrijving: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, lineHeight: 19 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8 },
  meta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.inkMuted },
  substatus: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.accentDark,
    borderWidth: 1,
    borderColor: colors.accentPale,
    backgroundColor: colors.accentTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
