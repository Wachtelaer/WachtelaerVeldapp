import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listWervenMetPlannen, type WerfPlannenSummary } from '@/lib/api/plannen';
import { colors, fonts } from '@/lib/theme';

export default function PlannenWervenScreen() {
  const { profile } = useAuth();
  const [werven, setWerven] = useState<WerfPlannenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setWerven(await listWervenMetPlannen(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon plannen niet laden');
    }
  }, [profile]);

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
      <AppHeader kicker="Plannen & documenten" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Plannen &amp; documenten</Text>
        <Text style={styles.subtitle}>Altijd de laatste versie. Wie de oude versie open had, krijgt een melding.</Text>

        {werven === null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {werven?.map((w) => (
          <TouchableOpacity
            key={w.werfId}
            style={styles.card}
            onPress={() => router.push(`/plannen/${w.werfId}`)}
            accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitel}>{w.werfNaam}</Text>
              <Text style={styles.cardMeta}>{`${w.aantalDocumenten} document${w.aantalDocumenten === 1 ? '' : 'en'}`}</Text>
            </View>
            {w.nieuwCount > 0 ? <Tag label="nieuw" tone="accent" /> : null}
          </TouchableOpacity>
        ))}

        {werven && werven.length === 0 ? (
          <Text style={styles.empty}>Je bent nog aan geen enkele werf toegewezen.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    textTransform: 'uppercase',
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 8,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: -4 },
  error: { fontFamily: fonts.body, color: colors.danger },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
  },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
});
