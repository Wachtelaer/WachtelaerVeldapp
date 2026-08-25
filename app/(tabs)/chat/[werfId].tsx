import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { usePhotoSourcePicker } from '@/components/PhotoSourceSheet';
import { BackRow } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { getWerf } from '@/lib/api/werven';
import { getChatFotoUrl, listMessages, markThreadRead, sendMessage, type SendMessageInput } from '@/lib/api/chat';
import { enqueueChatBericht, useConnectivity } from '@/lib/offlineQueue';
import type { WerfChatBericht } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

function ChatFoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getChatFotoUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <View style={styles.chatFoto}>
      {url ? <Image source={{ uri: url }} style={styles.chatFotoImg} resizeMode="cover" /> : null}
    </View>
  );
}

export default function ChatThreadScreen() {
  const { werfId } = useLocalSearchParams<{ werfId: string }>();
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [werfNaam, setWerfNaam] = useState('');
  const [messages, setMessages] = useState<(WerfChatBericht & { auteurNaam: string })[]>([]);
  const [draft, setDraft] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const { open: openFotoSheet, busy: fotoBusy, sheet: fotoSheet } = usePhotoSourcePicker((uris) =>
    setFotoUri(uris[0] ?? null)
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!werfId || !profile) return;
    try {
      setError(null);
      const [w, msgs] = await Promise.all([getWerf(werfId), listMessages(werfId)]);
      setWerfNaam(w.naam);
      setMessages(msgs);
      await markThreadRead(werfId, profile.id);
    } catch (e: any) {
      setError(e.message ?? 'Kon chat niet laden');
    }
  }, [werfId, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    if (!werfId || !profile || (!draft.trim() && !fotoUri)) return;
    setSending(true);
    const payload: SendMessageInput = { werfId, auteurId: profile.id, tekst: draft.trim(), fotoUri };
    setDraft('');
    setFotoUri(null);
    try {
      if (isOnline) {
        await sendMessage(payload);
        await load();
      } else {
        await enqueueChatBericht(payload);
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            werf_id: werfId,
            auteur_id: profile.id,
            tekst: payload.tekst,
            foto_storage_path: null,
            created_at: new Date().toISOString(),
            auteurNaam: profile.full_name,
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader kicker={werfNaam} />
      <BackRow label="Chats" onPress={() => router.push('/chat')} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!error && messages.length === 0 ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {messages.map((m) => {
          const mine = m.auteur_id === profile?.id;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!mine ? <Text style={styles.bubbleVan}>{m.auteurNaam}</Text> : null}
              {m.foto_storage_path ? <ChatFoto path={m.foto_storage_path} /> : null}
              {m.tekst ? <Text style={styles.bubbleTekst}>{m.tekst}</Text> : null}
              <Text style={[styles.bubbleTijd, mine && styles.bubbleTijdMine]}>{formatTijd(m.created_at)}</Text>
            </View>
          );
        })}
      </ScrollView>

      {fotoUri ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: fotoUri }} style={styles.previewImg} />
          <TouchableOpacity onPress={() => setFotoUri(null)} accessibilityRole="button">
            <Ionicons name="close-circle" size={22} color={colors.inkMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.iconBtn, fotoBusy && styles.iconBtnBusy]}
          onPress={openFotoSheet}
          disabled={fotoBusy}
          accessibilityRole="button">
          <Ionicons name="camera-outline" size={18} color={colors.accentDark} />
        </TouchableOpacity>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Bericht naar de werf…"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
        />
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={send}
          disabled={sending || (!draft.trim() && !fotoUri)}
          accessibilityRole="button">
          <Ionicons name="send" size={17} color={colors.white} />
        </TouchableOpacity>
      </View>

      {fotoSheet}
    </KeyboardAvoidingView>
  );
}

function formatTijd(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 10, flexGrow: 1 },
  error: { fontFamily: fonts.body, color: colors.danger },
  bubble: { maxWidth: '80%', padding: 9, paddingHorizontal: 11, borderWidth: 1 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderColor: colors.accentDark },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderColor: colors.divider },
  bubbleVan: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentDark,
    marginBottom: 4,
  },
  bubbleTekst: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  bubbleTijd: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted, marginTop: 5 },
  bubbleTijdMine: { color: colors.accentTint2, textAlign: 'right' },
  chatFoto: {
    width: 150,
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.chipBg,
    marginBottom: 6,
    overflow: 'hidden',
  },
  chatFotoImg: { width: '100%', height: '100%' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.surface,
  },
  previewImg: { width: 40, height: 40, borderWidth: 1, borderColor: colors.dividerStrong },
  inputRow: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    padding: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnBusy: { opacity: 0.5 },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
