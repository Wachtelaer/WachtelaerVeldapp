import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listChatThreads, type ChatThread } from '@/lib/api/chat';
import { colors, fonts } from '@/lib/theme';

export default function ChatThreadsScreen() {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setThreads(await listChatThreads(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon chats niet laden');
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
      <AppHeader kicker="Werfchats" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Chat</Text>

        {threads === null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {threads?.map((t) => (
          <TouchableOpacity
            key={t.werfId}
            style={styles.card}
            onPress={() => router.push(`/chat/${t.werfId}`)}
            accessibilityRole="button">
            <View style={styles.cardTop}>
              <Text style={styles.cardTitel} numberOfLines={1}>
                {t.werfNaam}
              </Text>
              <Text style={styles.cardTijd}>{t.laatste ? formatTijd(t.laatste.created_at) : ''}</Text>
            </View>
            <Text style={styles.cardLaatste} numberOfLines={1}>
              {t.laatste
                ? `${t.laatste.auteurNaam}: ${t.laatste.tekst || (t.laatste.foto_storage_path ? '📷 foto' : '')}`
                : 'Nog geen berichten'}
            </Text>
            <View style={styles.tagRow}>
              <Tag label={`${t.ledenCount} leden`} />
              {t.ongelezen ? <Tag label="nieuw" tone="accent" /> : null}
            </View>
          </TouchableOpacity>
        ))}

        {threads && threads.length === 0 ? (
          <Text style={styles.empty}>Je bent nog aan geen enkele werf toegewezen.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatTijd(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
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
    marginBottom: 4,
  },
  error: { fontFamily: fonts.body, color: colors.danger },
  card: { borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardTijd: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
  cardLaatste: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  tagRow: { flexDirection: 'row', gap: 6 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
});
