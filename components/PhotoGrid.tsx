import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';
import { getFotoUrl } from '@/lib/api/rapporten';
import type { WerfrapportFoto } from '@/lib/database.types';

function useSignedUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getFotoUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

function RemotePhoto({ foto, aspectRatio = 1 }: { foto: WerfrapportFoto; aspectRatio?: number }) {
  const url = useSignedUrl(foto.storage_path);
  return (
    <View style={[styles.thumb, { aspectRatio }]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={styles.placeholderFill} />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {foto.label}
      </Text>
    </View>
  );
}

export function RemotePhotoGrid({
  fotos,
  columns = 3,
  aspectRatio = 1,
}: {
  fotos: WerfrapportFoto[];
  columns?: number;
  aspectRatio?: number;
}) {
  if (!fotos.length) {
    return <Text style={styles.empty}>Nog geen foto's.</Text>;
  }
  return (
    <View style={[styles.grid, { gap: 6 }]}>
      {fotos.map((f) => (
        <View key={f.id} style={{ width: `${100 / columns - 2}%` }}>
          <RemotePhoto foto={f} aspectRatio={aspectRatio} />
        </View>
      ))}
    </View>
  );
}

export function LocalPhotoThumb({ uri, onRemove }: { uri: string; onRemove?: () => void }) {
  return (
    <View style={styles.thumb}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      {onRemove ? (
        <View style={styles.removeBadge}>
          <Ionicons name="close" size={12} color={colors.white} onPress={onRemove} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: {
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.chipBg,
    justifyContent: 'flex-end',
    padding: 4,
    overflow: 'hidden',
  },
  placeholderFill: { ...StyleSheet.absoluteFill, backgroundColor: colors.chipBg },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 8.5,
    textTransform: 'uppercase',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    paddingHorizontal: 3,
    alignSelf: 'flex-start',
  },
  removeBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(29,31,32,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
});
