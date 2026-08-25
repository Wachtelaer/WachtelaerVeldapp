import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';

/**
 * RN's Alert.alert() is a no-op on web (react-native-web has no multi-button
 * dialog primitive), so the camera/library choice needs its own cross-platform
 * UI instead of relying on it.
 */
export function PhotoSourceSheet({
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
  // Launching the native camera/library while this Modal is still on screen
  // (or mid-dismiss) makes two native presentations race, which crashes the
  // app on iOS/Android — so close first and only then, once the Modal has
  // actually finished its dismiss animation, fire the picker.
  const choose = (action: () => void) => {
    onClose();
    setTimeout(action, 350);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Foto toevoegen</Text>
          <Pressable style={styles.option} onPress={() => choose(onPickCamera)} accessibilityRole="button">
            <Ionicons name="camera-outline" size={19} color={colors.accentDark} />
            <Text style={styles.optionLabel}>Foto maken</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={() => choose(onPickLibrary)} accessibilityRole="button">
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
