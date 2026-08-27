import { Image, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/lib/theme';

/** Full-screen tap-to-close view of a single photo. Pass `uri={null}` to keep it closed. */
export function PhotoLightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(29,31,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
