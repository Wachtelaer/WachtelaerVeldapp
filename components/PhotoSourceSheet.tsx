import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';

// A launch is considered "settled" only this long after the modal closes
// (before opening the camera/library) or after the picker itself returns
// (before this becomes tappable again). Native camera/library and RN's
// Modal each run their own dismiss animation; overlapping two native
// presentations — reopening before the previous one has actually torn
// down — crashes the app on iOS/Android, so every step is serialized
// through this settle delay instead of relying on timing alone.
const SETTLE_MS = 350;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Manages the "camera vs library" choice and hands back picked URIs.
 * Renders nothing itself — spread `sheet` into the screen, wire the
 * trigger button to `open`, and disable it while `busy` (a pick is in
 * flight, including its settle delays).
 */
export function usePhotoSourcePicker(
  onPicked: (uris: string[]) => void,
  { allowsMultipleSelection = false }: { allowsMultipleSelection?: boolean } = {}
) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const runPick = async (launch: () => Promise<ImagePicker.ImagePickerResult>) => {
    try {
      const result = await launch();
      if (!result.canceled) {
        onPicked(result.assets.map((a) => a.uri));
      }
    } finally {
      await delay(SETTLE_MS);
      setBusy(false);
    }
  };

  const pickFromCamera = () =>
    runPick(async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return { canceled: true, assets: null };
      return ImagePicker.launchCameraAsync({ quality: 0.7 });
    });

  const pickFromLibrary = () =>
    runPick(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection }));

  const choose = (launch: () => Promise<void>) => {
    setVisible(false);
    setTimeout(launch, SETTLE_MS);
  };

  const open = () => {
    if (busy) return;
    setBusy(true);
    setVisible(true);
  };

  const close = () => {
    setVisible(false);
    setBusy(false);
  };

  const sheet = (
    <PhotoSourceSheet
      visible={visible}
      onClose={close}
      onPickCamera={() => choose(pickFromCamera)}
      onPickLibrary={() => choose(pickFromLibrary)}
    />
  );

  return { open, busy, sheet };
}

function PhotoSourceSheet({
  visible,
  onClose,
  onPickCamera,
  onPickLibrary,
}: {
  visible: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickLibrary: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Foto toevoegen</Text>
          <Pressable style={styles.option} onPress={onPickCamera} accessibilityRole="button">
            <Ionicons name="camera-outline" size={19} color={colors.accentDark} />
            <Text style={styles.optionLabel}>Foto maken</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onPickLibrary} accessibilityRole="button">
            <Ionicons name="images-outline" size={19} color={colors.accentDark} />
            <Text style={styles.optionLabel}>Kies uit bibliotheek</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.option} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Annuleren</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(29,31,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, padding: 16 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 14,
    textTransform: 'uppercase',
    color: colors.ink,
    marginBottom: 8,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  optionLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.divider, marginTop: 4 },
  cancelLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.inkMuted },
});
