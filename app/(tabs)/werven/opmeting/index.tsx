import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { OpmetingCard } from '@/components/OpmetingCard';
import { BackRow } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listOpmetingen, type OpmetingListItem } from '@/lib/api/opmetingen';
import { colors, fonts } from '@/lib/theme';

export default function AlleOpmetingenScreen() {
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';
  const [opmetingen, setOpmetingen] = useState<OpmetingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setOpmetingen(await listOpmetingen());
    } catch (e: any) {
      setError(e.message ?? 'Kon opmetingen niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.root}>
      <AppHeader kicker={`Opmetingen${opmetingen ? ` · ${opmetingen.length}` : ''}`} />
      <BackRow label="Werven" onPress={() => router.replace('/werven')} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{isMgmt ? 'Alle opmetingen' : 'Mijn opmetingen'}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {opmetingen === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {opmetingen?.length === 0 ? <Text style={styles.empty}>Nog geen opmetingen.</Text> : null}

        {opmetingen?.map((o) => (
          <OpmetingCard key={o.id} opmeting={o} toonVerkoper={isMgmt} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  error: { fontFamily: fonts.body, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
});
