import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, KpiTile, SectionLabel } from '@/components/ui/Basics';
import { TextField } from '@/components/ui/Form';
import { RemotePhotoGrid } from '@/components/PhotoGrid';
import { useAuth } from '@/context/AuthProvider';
import { addReactie, getRapport, type RapportDetail } from '@/lib/api/rapporten';
import { enqueueReactie, useConnectivity } from '@/lib/offlineQueue';
import { colors, fonts } from '@/lib/theme';

export default function RapportDetailScreen() {
  const { rapportId } = useLocalSearchParams<{ rapportId: string }>();
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [rapport, setRapport] = useState<RapportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reactieTekst, setReactieTekst] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!rapportId) return;
    try {
      setError(null);
      setRapport(await getRapport(rapportId));
    } catch (e: any) {
      setError(e.message ?? 'Kon rapport niet laden');
    }
  }, [rapportId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sendReactie = async () => {
    if (!reactieTekst.trim() || !rapportId || !profile) return;
    setSending(true);
    const tekst = reactieTekst.trim();
    setReactieTekst('');
    try {
      if (isOnline) {
        await addReactie(rapportId, profile.id, tekst);
        await load();
      } else {
        await enqueueReactie({ rapportId, auteurId: profile.id, tekst });
      }
    } finally {
      setSending(false);
    }
  };

  const blokken = rapport
    ? [
        rapport.uitgevoerd.trim() ? { kop: 'Uitgevoerd', tekst: rapport.uitgevoerd } : null,
        rapport.knelpunt.trim() ? { kop: 'Knelpunt', tekst: rapport.knelpunt } : null,
      ].filter((b): b is { kop: string; tekst: string } => !!b)
    : [];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader kicker={rapport ? `Werfrapport · ${formatDatum(rapport.datum)}` : 'Werfrapport'} />
      <BackRow label="Terug naar werf" onPress={() => router.push(`/werven/${rapport?.werf_id ?? ''}`)} />
      <ScrollView contentContainerStyle={styles.body}>
        {!rapport && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {rapport ? (
          <>
            <View>
              <SectionLabel>
                {`Werfrapport · ${[rapport.deel_mgmt && 'management', rapport.deel_werf && 'werf', rapport.deel_klant && 'klant'].filter(Boolean).join(' + ') || 'niet gedeeld'}`}
              </SectionLabel>
              <Text style={styles.datum}>{formatDatumLang(rapport.datum)}</Text>
              <Text style={styles.meta}>{`${rapport.auteurNaam} · ${rapport.weer}`}</Text>
            </View>

            <View style={styles.kpiRow}>
              <KpiTile value={String(rapport.aanwezig_eigen)} label="eigen personeel" />
              <KpiTile value={String(rapport.aanwezig_onderaanneming)} label="onderaanneming" />
            </View>

            {blokken.map((b) => (
              <View key={b.kop} style={styles.blok}>
                <Text style={styles.blokKop}>{b.kop}</Text>
                <Text style={styles.blokTekst}>{b.tekst}</Text>
              </View>
            ))}

            <View>
              <SectionLabel>{`Foto's van het rapport (${rapport.fotos.length})`}</SectionLabel>
              <RemotePhotoGrid fotos={rapport.fotos} columns={2} aspectRatio={4 / 3} />
            </View>

            <View style={styles.reactiesCard}>
              <SectionLabel>Reacties</SectionLabel>
              {rapport.reacties.map((c) => (
                <View key={c.id} style={styles.reactie}>
                  <Text style={styles.reactieVan}>{`${c.auteurNaam} · ${formatTijd(c.created_at)}`}</Text>
                  <Text style={styles.reactieTekst}>{c.tekst}</Text>
                </View>
              ))}
              <View style={styles.reactieInputRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    value={reactieTekst}
                    onChangeText={setReactieTekst}
                    placeholder="Reageer op dit rapport…"
                  />
                </View>
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={sendReactie}
                  disabled={sending || !reactieTekst.trim()}
                  accessibilityRole="button">
                  <Ionicons name="send" size={17} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}
function formatDatumLang(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatTijd(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  error: { fontFamily: fonts.body, color: colors.danger },
  datum: { fontFamily: fonts.headingBold, fontSize: 26, textTransform: 'uppercase', color: colors.ink, marginTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  blok: { gap: 6 },
  blokKop: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accentDark,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 5,
  },
  blokTekst: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.ink },
  reactiesCard: { borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 10 },
  reactie: { borderLeftWidth: 2, borderLeftColor: colors.accentPale, paddingLeft: 9, gap: 2 },
  reactieVan: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.accentDark },
  reactieTekst: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  reactieInputRow: { flexDirection: 'row', gap: 8 },
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
