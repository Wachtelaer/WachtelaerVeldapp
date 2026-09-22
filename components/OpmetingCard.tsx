import { StyleSheet, Text, View } from 'react-native';

import { Tag } from '@/components/ui/Basics';
import type { OpmetingListItem } from '@/lib/api/opmetingen';
import { getModule, summarizeAntwoorden } from '@/lib/salesModules';
import { colors, fonts } from '@/lib/theme';

function formatDatum(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

export function OpmetingCard({ opmeting, toonVerkoper }: { opmeting: OpmetingListItem; toonVerkoper: boolean }) {
  const mod = getModule(opmeting.module);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={1}>
          {opmeting.klant_naam || '(naam ontbreekt)'}
        </Text>
        <Text style={styles.cardFase}>{formatDatum(opmeting.created_at)}</Text>
      </View>
      <Text style={styles.cardMeta} numberOfLines={2}>
        {toonVerkoper
          ? `${opmeting.verkoperNaam} · ${mod.naam} · ${summarizeAntwoorden(mod, opmeting.antwoorden)}`
          : `${mod.naam} · ${summarizeAntwoorden(mod, opmeting.antwoorden)}`}
      </Text>
      <View style={styles.tagRow}>
        <Tag label={`${opmeting.fotoCount} foto's`} />
        <Tag label={opmeting.status} tone="accent" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
