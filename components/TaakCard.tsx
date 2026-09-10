import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { TaakListItem } from '@/lib/api/taken';
import { colors, fonts } from '@/lib/theme';

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

export function TaakCard({
  taak,
  toonToegewezenAan,
  toonWerf = true,
  busy,
  onToggle,
  onDelete,
}: {
  taak: TaakListItem;
  toonToegewezenAan: boolean;
  toonWerf?: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  const isWerfTaak = taak.toegewezenAanNaam === null;
  const metaBits = [
    toonToegewezenAan ? (taak.toegewezenAanNaam ?? 'Hele werf') : isWerfTaak ? 'Gedeeld met werf' : `door ${taak.aangemaaktDoorNaam}`,
    toonWerf ? taak.werfNaam : null,
    isWerfTaak && taak.gedaan && taak.gedaanDoorNaam ? `afgevinkt door ${taak.gedaanDoorNaam}` : null,
    formatDatum(taak.created_at),
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHead} onPress={onToggle} disabled={busy} accessibilityRole="button">
        <View style={[styles.checkbox, taak.gedaan && styles.checkboxOn]}>
          {busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : taak.gedaan ? (
            <Ionicons name="checkmark" size={14} color={colors.white} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitel, taak.gedaan && styles.cardTitelGedaan]}>{taak.titel}</Text>
          <Text style={styles.cardMeta}>{metaBits.join(' · ')}</Text>
        </View>
        {onDelete ? (
          <TouchableOpacity onPress={onDelete} accessibilityRole="button" style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={17} color={colors.inkMuted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      {taak.omschrijving ? <Text style={styles.cardOmschrijving}>{taak.omschrijving}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  cardTitel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  cardTitelGedaan: { color: colors.inkMuted, textDecorationLine: 'line-through' },
  cardMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  cardOmschrijving: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18, paddingLeft: 34 },
  deleteBtn: { padding: 4 },
});
