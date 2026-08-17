import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { RemotePhotoGrid } from '@/components/PhotoGrid';
import { useAuth } from '@/context/AuthProvider';
import {
  getWerf,
  isLeiderOfWerf,
  listRapportenForWerf,
  listRecentFotosForWerf,
} from '@/lib/api/werven';
import type { Werf, Werfrapport, WerfrapportFoto } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

export default function WerfDetailScreen() {
  const { werfId } = useLocalSearchParams<{ werfId: string }>();
  const { profile } = useAuth();

  const [werf, setWerf] = useState<Werf | null>(null);
  const [isLeider, setIsLeider] = useState(false);
  const [rapporten, setRapporten] = useState<(Werfrapport & { auteurNaam: string })[]>([]);
  const [fotos, setFotos] = useState<WerfrapportFoto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!werfId || !profile) return;
    try {
      setError(null);
      const [w, leider, r, f] = await Promise.all([
        getWerf(werfId),
        isLeiderOfWerf(werfId, profile.id),
        listRapportenForWerf(werfId),
        listRecentFotosForWerf(werfId, 6),
      ]);
      setWerf(w);
      setIsLeider(leider || profile.role === 'mgmt');
      setRapporten(r);
      setFotos(f as any);
    } catch (e: any) {
      setError(e.message ?? 'Kon werf niet laden');
    }
  }, [werfId, profile]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker={werf?.code ?? ''} />
      <BackRow label="Werven" onPress={() => router.replace('/werven')} />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {!werf && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {werf ? (
          <>
            <View>
              <SectionLabel>{`Dossier ${werf.code}`}</SectionLabel>
              <Text style={styles.naam}>{werf.naam}</Text>
              <Text style={styles.adres}>{werf.adres}</Text>
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => router.push(`/chat/${werf.id}`)}
                accessibilityRole="button">
                <Ionicons name="chatbubbles-outline" size={16} color={colors.accent} />
                <Text style={styles.secondaryActionLabel}>Werfchat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => router.push(`/plannen/${werf.id}`)}
                accessibilityRole="button">
                <Ionicons name="document-text-outline" size={16} color={colors.accent} />
                <Text style={styles.secondaryActionLabel}>Plannen</Text>
              </TouchableOpacity>
            </View>

            {isLeider ? (
              <Button
                label="Rapport van vandaag maken"
                onPress={() => router.push(`/werven/${werf.id}/nieuw`)}
              />
            ) : null}

            <View>
              <SectionLabel>Werfrapporten</SectionLabel>
              {rapporten.length === 0 ? (
                <Text style={styles.empty}>Nog geen rapporten voor deze werf.</Text>
              ) : (
                rapporten.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.rapportRow}
                    onPress={() => router.push(`/werven/rapport/${r.id}`)}
                    accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rapportTitel}>{`${formatDatum(r.datum)} · ${r.auteurNaam}`}</Text>
                      <Text style={styles.rapportKort} numberOfLines={1}>
                        {r.uitgevoerd || r.knelpunt || '—'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View>
              <SectionLabel>Recente foto's</SectionLabel>
              <RemotePhotoGrid fotos={fotos} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatDatum(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  error: { fontFamily: fonts.body, color: colors.danger },
  naam: { fontFamily: fonts.headingBold, fontSize: 26, textTransform: 'uppercase', color: colors.ink, marginTop: 4 },
  adres: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryActionLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  rapportRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rapportTitel: { fontFamily: fonts.heading, fontSize: 15, textTransform: 'uppercase', color: colors.ink },
  rapportKort: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
});
