import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { colors, fonts } from '@/lib/theme';

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' }) {
  return (
    <View style={[styles.tag, tone === 'accent' ? styles.tagAccent : styles.tagNeutral]}>
      <Text style={[styles.tagText, tone === 'accent' && styles.tagTextAccent]}>{label}</Text>
    </View>
  );
}

export function KpiTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export function BackRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.backRow}
      onPress={onPress ?? (() => router.back())}
      accessibilityRole="button">
      <Ionicons name="chevron-back" size={16} color={colors.accentDark} />
      <Text style={styles.backLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function OfflineBanner({ queued }: { queued: number }) {
  if (queued <= 0) return null;
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.accentDarker} />
      <Text style={styles.offlineText}>
        Geen verbinding — {queued} item{queued === 1 ? '' : 's'} wachten op verzending
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 8,
  },
  tag: { paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1 },
  tagNeutral: { backgroundColor: colors.chipBg, borderColor: colors.divider },
  tagAccent: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  tagText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.chipText,
  },
  tagTextAccent: { color: colors.white },
  kpi: { flex: 1, backgroundColor: colors.surface, padding: 10 },
  kpiValue: { fontFamily: fonts.heading, fontSize: 26, color: colors.navy },
  kpiLabel: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.inkMuted,
    marginTop: 4,
  },
  backRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingHorizontal: 16,
  },
  backLabel: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accentDark },
  offlineBanner: {
    backgroundColor: colors.accentTint2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.accentDarker, flexShrink: 1 },
});
