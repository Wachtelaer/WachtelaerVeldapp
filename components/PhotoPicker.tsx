import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LocalPhotoThumb } from '@/components/PhotoGrid';
import { usePhotoSourcePicker } from '@/components/PhotoSourceSheet';
import { colors, fonts } from '@/lib/theme';

export function PhotoPicker({ uris, onChange }: { uris: string[]; onChange: (uris: string[]) => void }) {
  const { open, busy, sheet } = usePhotoSourcePicker((newUris) => onChange([...uris, ...newUris]), {
    allowsMultipleSelection: true,
  });

  const removeAt = (index: number) => onChange(uris.filter((_, i) => i !== index));

  return (
    <View style={styles.grid}>
      {uris.map((uri, i) => (
        <View key={uri + i} style={styles.cell}>
          <LocalPhotoThumb uri={uri} onRemove={() => removeAt(i)} />
        </View>
      ))}
      <TouchableOpacity
        style={[styles.cell, styles.addCell, busy && styles.addCellBusy]}
        onPress={open}
        disabled={busy}
        accessibilityRole="button">
        <Ionicons name="camera-outline" size={22} color={colors.accentDark} />
        <Text style={styles.addLabel}>foto</Text>
      </TouchableOpacity>

      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31%' },
  addCell: {
    aspectRatio: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addCellBusy: { opacity: 0.5 },
  addLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.accentDark },
});
