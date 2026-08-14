import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { FieldLabel, Segmented, Stepper, TextArea, ToggleRow } from '@/components/ui/Form';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { getWerf } from '@/lib/api/werven';
import { createRapport } from '@/lib/api/rapporten';
import { enqueueRapport, useConnectivity } from '@/lib/offlineQueue';
import type { Weer, Werf } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

const WEER_OPTIES: { value: Weer; label: string }[] = [
  { value: 'Droog', label: 'Droog' },
  { value: 'Regen', label: 'Regen' },
  { value: 'Hitte', label: 'Hitte' },
];

export default function NieuwRapportScreen() {
  const { werfId } = useLocalSearchParams<{ werfId: string }>();
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [werf, setWerf] = useState<Werf | null>(null);
  const [weer, setWeer] = useState<Weer>('Droog');
  const [aanwezigEigen, setAanwezigEigen] = useState(4);
  const [aanwezigOnderaanneming, setAanwezigOnderaanneming] = useState(0);
  const [uitgevoerd, setUitgevoerd] = useState('');
  const [knelpunt, setKnelpunt] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [deelMgmt, setDeelMgmt] = useState(true);
  const [deelWerf, setDeelWerf] = useState(true);
  const [deelKlant, setDeelKlant] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (werfId) getWerf(werfId).then(setWerf);
  }, [werfId]);

  const submit = async () => {
    if (!werfId || !profile) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      werfId,
      auteurId: profile.id,
      weer,
      aanwezigEigen,
      aanwezigOnderaanneming,
      uitgevoerd,
      knelpunt,
      deelMgmt,
      deelWerf,
      deelKlant,
      fotoUris,
    };
    try {
      if (isOnline) {
        await createRapport(payload);
      } else {
        await enqueueRapport(payload);
      }
      router.replace({
        pathname: '/werven/[werfId]/klaar',
        params: {
          werfId,
          offline: isOnline ? '0' : '1',
          deelMgmt: deelMgmt ? '1' : '0',
          deelWerf: deelWerf ? '1' : '0',
          deelKlant: deelKlant ? '1' : '0',
          fotoAantal: String(fotoUris.length),
          werfNaam: werf?.naam ?? '',
        },
      });
    } catch (e: any) {
      // Online submission failed (e.g. connection dropped mid-request) — fall back to the queue
      // instead of losing the report the werfleider just wrote.
      await enqueueRapport(payload);
      router.replace({
        pathname: '/werven/[werfId]/klaar',
        params: {
          werfId,
          offline: '1',
          deelMgmt: deelMgmt ? '1' : '0',
          deelWerf: deelWerf ? '1' : '0',
          deelKlant: deelKlant ? '1' : '0',
          fotoAantal: String(fotoUris.length),
          werfNaam: werf?.naam ?? '',
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker="Nieuw werfrapport" />
      <BackRow label="Annuleren" />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Werfrapport vandaag</Text>
          <Text style={styles.subtitle}>
            {werf?.naam ?? ''} · alles wat je aanvinkt is meteen zichtbaar voor wie je hieronder kiest.
          </Text>
        </View>

        <View>
          <FieldLabel>Weer &amp; werkbaarheid</FieldLabel>
          <Segmented options={WEER_OPTIES} value={weer} onChange={setWeer} />
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Eigen personeel</FieldLabel>
            <Stepper value={aanwezigEigen} onChange={setAanwezigEigen} eenheid="man" />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Onderaanneming</FieldLabel>
            <Stepper value={aanwezigOnderaanneming} onChange={setAanwezigOnderaanneming} eenheid="man" />
          </View>
        </View>

        <View>
          <FieldLabel>Uitgevoerd vandaag</FieldLabel>
          <TextArea
            value={uitgevoerd}
            onChangeText={setUitgevoerd}
            placeholder="Leidingwerk verdiep 1 afgewerkt, collectoren geplaatst…"
          />
        </View>

        <View>
          <FieldLabel>Knelpunt of vraag</FieldLabel>
          <TextArea value={knelpunt} onChangeText={setKnelpunt} placeholder="Optioneel" />
        </View>

        <View>
          <FieldLabel>{`Foto's (${fotoUris.length})`}</FieldLabel>
          <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
        </View>

        <View style={styles.delenCard}>
          <SectionLabel>Delen met</SectionLabel>
          <ToggleRow checked={deelMgmt} onToggle={() => setDeelMgmt((v) => !v)} titel="Management" sub="Ziet alle werven" />
          <ToggleRow checked={deelWerf} onToggle={() => setDeelWerf((v) => !v)} titel="Ploeg op de werf" sub="Iedereen toegewezen aan deze werf" />
          <ToggleRow
            checked={deelKlant}
            onToggle={() => setDeelKlant((v) => !v)}
            titel="Klant / architect"
            sub="Alleen uitgevoerd werk en foto's, geen interne nota's"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={isOnline ? 'Rapport delen' : 'Opslaan in wachtrij'}
          onPress={submit}
          loading={submitting}
          disabled={!uitgevoerd.trim() && !knelpunt.trim()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 18, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5 },
  row: { flexDirection: 'row', gap: 10 },
  delenCard: { borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 10 },
  error: { fontFamily: fonts.body, color: colors.danger },
});
