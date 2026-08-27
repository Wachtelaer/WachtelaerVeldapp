import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, TextField } from '@/components/ui/Form';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { listAlleWerven } from '@/lib/api/werven';
import {
  countOnverwerkt,
  createMelding,
  getMeldingFotoUrl,
  listAlleMeldingen,
  listMijnMeldingen,
  zetVerwerkt,
  type MeldingListItem,
} from '@/lib/api/magazijn';
import { enqueueMagazijnMelding, useConnectivity } from '@/lib/offlineQueue';
import { colors, fonts } from '@/lib/theme';

const GEEN_WERF = 'Geen specifieke werf';

interface MeldingRegel {
  tekst: string;
  hoeveelheid: string;
}

const LEGE_REGEL: MeldingRegel = { tekst: '', hoeveelheid: '' };

export default function MagazijnScreen() {
  const { profile } = useAuth();
  const canOverzien = profile?.role === 'mgmt' || profile?.role === 'magazijnier';

  return (
    <View style={styles.root}>
      <AppHeader kicker={canOverzien ? 'Magazijn · meldingen' : 'Magazijn'} />
      {canOverzien ? <OverzichtView /> : <MeldingView />}
    </View>
  );
}

function OverzichtView() {
  const { profile } = useAuth();
  const [meldingen, setMeldingen] = useState<MeldingListItem[] | null>(null);
  const [onverwerkt, setOnverwerkt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [alle, teVerwerken] = await Promise.all([listAlleMeldingen(), countOnverwerkt()]);
      setMeldingen(alle);
      setOnverwerkt(teVerwerken);
    } catch (e: any) {
      setError(e.message ?? 'Kon meldingen niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const vandaag = (meldingen ?? []).filter((m) => isVandaag(m.created_at)).length;

  const toggleVerwerkt = async (m: MeldingListItem) => {
    if (!profile) return;
    setBusyId(m.id);
    try {
      await zetVerwerkt(m.id, profile.id, !m.verwerkt);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Magazijn</Text>
        <Text style={styles.subtitle}>Wat medewerkers hebben doorgegeven dat ze uit het magazijn namen.</Text>
      </View>

      <View style={styles.kpiRow}>
        <KpiTile value={String(onverwerkt)} label="onverwerkt" />
        <KpiTile value={String(vandaag)} label="vandaag" />
        <KpiTile value={String(meldingen?.length ?? 0)} label="totaal" />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {meldingen === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
      {meldingen?.length === 0 ? <Text style={styles.empty}>Nog geen meldingen.</Text> : null}

      {meldingen?.map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitel}>{m.melderNaam}</Text>
            <Text style={styles.cardTijd}>{formatTijd(m.created_at)}</Text>
          </View>
          <Text style={styles.cardTekst}>{m.tekst}</Text>
          <View style={styles.tagRow}>
            {m.hoeveelheid !== null ? <Tag label={`${m.hoeveelheid} ${m.eenheid}`.trim()} /> : null}
            {m.werfNaam ? <Tag label={m.werfNaam} /> : null}
          </View>
          {m.fotos.length > 0 ? (
            <View style={styles.fotoRow}>
              {m.fotos.map((f) => (
                <MeldingFotoThumb key={f.id} storagePath={f.storage_path} onOpen={setLightboxUri} />
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.verwerktBtn, m.verwerkt && styles.verwerktBtnActive]}
            onPress={() => toggleVerwerkt(m)}
            disabled={busyId === m.id}
            accessibilityRole="button">
            <Text style={[styles.verwerktBtnText, m.verwerkt && styles.verwerktBtnTextActive]}>
              {m.verwerkt ? '✓ verwerkt' : 'markeer als verwerkt'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
    <PhotoLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </>
  );
}

function MeldingView() {
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();
  const [alleWerven, setAlleWerven] = useState<{ id: string; naam: string }[]>([]);
  const [regels, setRegels] = useState<MeldingRegel[]>([{ ...LEGE_REGEL }]);
  const [werfNaam, setWerfNaam] = useState(GEEN_WERF);
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [mijnMeldingen, setMijnMeldingen] = useState<MeldingListItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setMijnMeldingen(await listMijnMeldingen(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon meldingen niet laden');
    }
  }, [profile]);

  useEffect(() => {
    listAlleWerven().then(setAlleWerven);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const gevuldeRegels = regels.filter((r) => r.tekst.trim());

  const updateRegel = (index: number, veld: keyof MeldingRegel, waarde: string) => {
    setRegels((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r));
      if (next[next.length - 1].tekst.trim()) next.push({ ...LEGE_REGEL });
      return next;
    });
  };

  const removeRegel = (index: number) => {
    setRegels((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ ...LEGE_REGEL }];
    });
  };

  const submit = async () => {
    if (!profile || gevuldeRegels.length === 0) return;
    setSubmitting(true);
    setError(null);
    const werf = alleWerven.find((w) => w.naam === werfNaam);
    const tekst = gevuldeRegels
      .map((r) => (r.hoeveelheid.trim() ? `${r.hoeveelheid.trim()}× ${r.tekst.trim()}` : r.tekst.trim()))
      .join('\n');
    const payload = {
      melderId: profile.id,
      werfId: werf?.id ?? null,
      tekst,
      hoeveelheid: null,
      eenheid: '',
      fotoUris,
    };
    try {
      if (isOnline) await createMelding(payload);
      else await enqueueMagazijnMelding(payload);
      setRegels([{ ...LEGE_REGEL }]);
      setWerfNaam(GEEN_WERF);
      setFotoUris([]);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Melding versturen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Magazijn</Text>
        <Text style={styles.subtitle}>
          Geef door wat je uit het magazijn hebt meegenomen. De magazijnier ziet dit meteen.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ gap: 8 }}>
        <FieldLabel>Wat neem je mee</FieldLabel>
        {regels.map((regel, i) => (
          <View key={i} style={styles.regelRow}>
            <View style={styles.regelTekst}>
              <TextField value={regel.tekst} onChangeText={(v) => updateRegel(i, 'tekst', v)} placeholder="Bv. zakken cement" />
            </View>
            <View style={styles.regelHoeveelheid}>
              <TextField value={regel.hoeveelheid} onChangeText={(v) => updateRegel(i, 'hoeveelheid', v)} placeholder="aantal" />
            </View>
            {regels.length > 1 ? (
              <TouchableOpacity onPress={() => removeRegel(i)} accessibilityRole="button" style={styles.regelRemove}>
                <Ionicons name="close" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      {alleWerven.length > 0 ? (
        <View style={{ gap: 7 }}>
          <FieldLabel>Voor welke werf (optioneel)</FieldLabel>
          <ChipGroup
            opties={[GEEN_WERF, ...alleWerven.map((w) => w.naam)]}
            value={werfNaam}
            onChange={(v) => setWerfNaam(v as string)}
          />
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <FieldLabel>{`Foto (${fotoUris.length})`}</FieldLabel>
        <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
      </View>

      <Button
        label={isOnline ? 'Melding versturen' : 'Opslaan in wachtrij'}
        onPress={submit}
        loading={submitting}
        disabled={gevuldeRegels.length === 0}
      />

      <View>
        <SectionLabel>Mijn meldingen</SectionLabel>
        {mijnMeldingen?.length === 0 ? <Text style={styles.empty}>Nog geen meldingen.</Text> : null}
        {mijnMeldingen?.map((m) => (
          <View key={m.id} style={styles.aanvraagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aanvraagTekst} numberOfLines={2}>
                {m.tekst}
              </Text>
              <Text style={styles.aanvraagMeta}>
                {`${formatTijd(m.created_at)}${m.werfNaam ? ` · ${m.werfNaam}` : ''}`}
              </Text>
            </View>
            <Tag label={m.verwerkt ? 'verwerkt' : 'in wachtrij'} tone={m.verwerkt ? 'accent' : 'neutral'} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MeldingFotoThumb({ storagePath, onOpen }: { storagePath: string; onOpen: (uri: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMeldingFotoUrl(storagePath).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [storagePath]);

  return (
    <TouchableOpacity
      style={styles.fotoThumb}
      onPress={() => url && onOpen(url)}
      disabled={!url}
      accessibilityRole="button">
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </TouchableOpacity>
  );
}

function isVandaag(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
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
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    borderStyle: 'dashed',
    padding: 14,
  },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  row: { flexDirection: 'row', gap: 10 },
  regelRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  regelTekst: { flex: 2 },
  regelHoeveelheid: { flex: 1 },
  regelRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 9 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardTijd: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
  cardTekst: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, lineHeight: 19 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fotoRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fotoThumb: { width: 56, height: 56, borderWidth: 1, borderColor: colors.dividerStrong, backgroundColor: colors.chipBg, overflow: 'hidden' },
  verwerktBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verwerktBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  verwerktBtnText: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.inkMuted },
  verwerktBtnTextActive: { color: colors.accentDarker },
  aanvraagRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aanvraagTekst: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  aanvraagMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});
