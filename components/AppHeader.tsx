import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useConnectivity } from '@/lib/offlineQueue';
import { colors, fonts } from '@/lib/theme';

export function AppHeader({ kicker }: { kicker: string }) {
  const { isOnline, queued } = useConnectivity();

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>Wachtelaer</Text>
        <Text style={styles.kicker}>{kicker}</Text>
      </View>
      <View style={styles.netBadge}>
        <Ionicons
          name={isOnline ? 'wifi' : 'cloud-offline-outline'}
          size={15}
          color={colors.white}
        />
        <Text style={styles.netText}>{isOnline ? 'online' : `wachtrij ${queued}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    fontFamily: fonts.headingBold,
    fontSize: 19,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.white,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.navyText,
    marginTop: 2,
  },
  netBadge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 10,
  },
  netText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.white,
  },
});
