import * as ImagePicker from 'expo-image-picker';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LocalPhotoThumb } from '@/components/PhotoGrid';
import { colors, fonts } from '@/lib/theme';

export function PhotoPicker({ uris, onChange }: { uris: string[]; onChange: (uris: string[]) => void }) {
  const maakFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      onChange([...uris, ...result.assets.map((a) => a.uri)]);
    }
  };

  const kiesUitBibliotheek = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      onChange([...uris, ...result.assets.map((a) => a.uri)]);
    }
  };

  const addFoto = () => {
    Alert.alert('Foto toevoegen', undefined, [
      { text: 'Foto maken', onPress: maakFoto },
      { text: 'Kies uit bibliotheek', onPress: kiesUitBibliotheek },
      { text: 'Annuleren', style: 'cancel' },
    ]);
  };

  const removeAt = (index: number) => onChange(uris.filter((_, i) => i !== index));

  return (
    <View style={styles.grid}>
      {uris.map((uri, i) => (
        <View key={uri + i} style={styles.cell}>
          <LocalPhotoThumb uri={uri} onRemove={() => removeAt(i)} />
        </View>
      ))}
      <TouchableOpacity style={[styles.cell, styles.addCell]} onPress={addFoto} accessibilityRole="button">
        <Ionicons name="camera-outline" size={22} color={colors.accentDark} />
        <Text style={styles.addLabel}>foto</Text>
      </TouchableOpacity>
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
  addLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.accentDark },
});
