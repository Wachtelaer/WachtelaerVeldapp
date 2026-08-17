import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { FieldLabel, Segmented, TextArea } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import {
  beoordeel,
  countInBehandeling,
  createAanvraag,
  getConflict,
  listAlleAanvragen,
  listMijnAanvragen,
  listTeKeuren,
  type AanvraagOverzichtItem,
  type TeKeurenItem,
} from '@/lib/api/verlof';
import { enqueueVerlofaanvraag, useConnectivity } from '@/lib/offlineQueue';
import type { Verlofaanvraag, VerlofType } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

const VERLOF_TYPES: { value: VerlofType; label: string }[] = [
  { value: 'Verlof', label: 'Verlof' },
  { value: 'Inhaalrust', label: 'Inhaalrust' },
  { value: 'Ziekte', label: 'Ziekte' },
];

export default function VerlofScreen() {
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';

  return (
    <View style={styles.root}>
      <AppHeader kicker={isMgmt ? 'Verlof · te beoordelen' : 'Verlof'} />
      <BackRow label="Meer" onPress={() => router.replace('/meer')} />
      {isMgmt ? <TeKeurenView /> : <AanvraagView />}
    </View>
  );
}

function TeKeurenView() {
  const { profile } = useAuth();
  const [items, setItems] = useState<TeKeurenItem[] | null>(null);
  const [overzicht, setOverzicht] = useState<AanvraagOverzichtItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [teKeuren, alle] = await Promise.all([listTeKeuren(), listAlleAanvragen()]);
      setItems(teKeuren);
      setOverzicht(alle);
    } catch (e: any) {
      setError(e.message ?? 'Kon aanvragen niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handle = async (id: string, status: 'goed' | 'nee') => {
    if (!profile) return;
    setBusyId(id);
    try {
      await beoordeel(id, profile.id, status);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Verlofaanvragen</Text>
        <Text style={styles.subtitle}>Je ziet meteen wie er op die dagen al weg is en op welke werf die persoon staat.</Text>
      </View>

      {items === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items?.length === 0 ? <Text style={styles.empty}>Niets meer te beoordelen.</Text> : null}

      {items?.map((a) => (
        <View key={a.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitel}>{a.aanvragerNaam}</Text>
            <Text style={styles.cardDagen}>{dagenTussen(a.van, a.tot)}</Text>
          </View>
          <Text style={styles.cardMeta}>{`${periodeLabel(a.van, a.tot)} · ${a.type}`}</Text>
          <Text style={styles.impact}>{a.impact}</Text>
          <View style={styles.row}>
            <Button label="Goedkeuren" onPress={() => handle(a.id, 'goed')} loading={busyId === a.id} />
            <Button label="Weigeren" variant="secondary" onPress={() => handle(a.id, 'nee')} loading={busyId === a.id} />
          </View>
        </View>
      ))}

      <View>
        <SectionLabel>Overzicht — alle aanvragen, op periode</SectionLabel>
        {overzicht?.length === 0 ? <Text style={styles.empty}>Nog geen aanvragen.</Text> : null}
        {overzicht?.map((a) => (
          <View key={a.id} style={styles.aanvraagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aanvraagPeriode}>{`${a.aanvragerNaam} — ${periodeLabel(a.van, a.tot)}`}</Text>
              <Text style={styles.aanvraagMeta}>{`${a.type} · ${dagenTussen(a.van, a.tot)}`}</Text>
            </View>
            <Tag
              label={a.status === 'goed' ? 'goedgekeurd' : a.status === 'nee' ? 'geweigerd' : 'in behandeling'}
              tone={a.status === 'goed' ? 'accent' : 'neutral'}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function AanvraagView() {
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();
  const [type, setType] = useState<VerlofType>('Verlof');
  const [van, setVan] = useState('');
  const [tot, setTot] = useState('');
  const [nota, setNota] = useState('');
  const [conflict, setConflict] = useState('');
  const [mijnAanvragen, setMijnAanvragen] = useState<Verlofaanvraag[] | null>(null);
  const [inBehandeling, setInBehandeling] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      const [aanvragen, wacht] = await Promise.all([listMijnAanvragen(profile.id), countInBehandeling(profile.id)]);
      setMijnAanvragen(aanvragen);
      setInBehandeling(wacht);
    } catch (e: any) {
      setError(e.message ?? 'Kon aanvragen niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!profile) return;
    if (!van || !tot) {
      setConflict('Kies een periode om te checken wie er al weg is.');
      return;
    }
    getConflict(profile.id, van, tot)
      .then(setConflict)
      .catch((e: any) => setConflict(`Kon niet checken: ${e.message ?? 'onbekende fout'}`));
  }, [profile, van, tot]);

  const submit = async () => {
    if (!profile || !van || !tot) return;
    setSubmitting(true);
    setError(null);
    const payload = { aanvragerId: profile.id, type, van, tot, nota: nota.trim() };
    try {
      if (isOnline) await createAanvraag(payload);
      else await enqueueVerlofaanvraag(payload);
      setNota('');
      setVan('');
      setTot('');
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Aanvraag versturen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Verlof aanvragen</Text>
        <Text style={styles.subtitle}>Je aanvraag gaat naar management. Je ziet er meteen bij of er die dagen al iemand van jouw werf weg is.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.kpiRow}>
        <KpiTile value={String(profile?.verlof_dagen ?? 0)} label="dagen over" />
        <KpiTile value={String(inBehandeling)} label="in behandeling" />
        <KpiTile value={String(profile?.inhaalrust_dagen ?? 0)} label="inhaalrust" />
      </View>

      <View style={{ gap: 7 }}>
        <FieldLabel>Soort</FieldLabel>
        <Segmented options={VERLOF_TYPES} value={type} onChange={setType} />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <FieldLabel>Van</FieldLabel>
          <DatePickerField value={van} onChange={setVan} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <FieldLabel>Tot</FieldLabel>
          <DatePickerField value={tot} onChange={setTot} />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel>Nota (optioneel)</FieldLabel>
        <TextArea value={nota} onChangeText={setNota} placeholder="Halve dag op vrijdag volstaat ook" />
      </View>

      <View style={styles.conflictCard}>
        <SectionLabel>Op die dagen</SectionLabel>
        <Text style={styles.conflictText}>{conflict}</Text>
      </View>

      <Button
        label={isOnline ? 'Aanvraag versturen' : 'Opslaan in wachtrij'}
        onPress={submit}
        loading={submitting}
        disabled={!van || !tot}
      />

      <View>
        <SectionLabel>Mijn aanvragen</SectionLabel>
        {mijnAanvragen?.length === 0 ? <Text style={styles.empty}>Nog geen aanvragen.</Text> : null}
        {mijnAanvragen?.map((a) => (
          <View key={a.id} style={styles.aanvraagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aanvraagPeriode}>{periodeLabel(a.van, a.tot)}</Text>
              <Text style={styles.aanvraagMeta}>{`${a.type} · ${dagenTussen(a.van, a.tot)}`}</Text>
            </View>
            <Tag
              label={a.status === 'goed' ? 'goedgekeurd' : a.status === 'nee' ? 'geweigerd' : 'in behandeling'}
              tone={a.status === 'goed' ? 'accent' : 'neutral'}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function periodeLabel(van: string, tot: string) {
  const fmt = (s: string) => new Date(s).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
  return van === tot ? fmt(van) : `${fmt(van)} – ${fmt(tot)}`;
}

function dagenTussen(van: string, tot: string) {
  const days = Math.round((new Date(tot).getTime() - new Date(van).getTime()) / 86400000) + 1;
  return days === 1 ? '1 dag' : `${days} dagen`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, borderWidth: 1, borderColor: colors.dividerStrong, borderStyle: 'dashed', padding: 14 },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  row: { flexDirection: 'row', gap: 10 },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 17, textTransform: 'uppercase', color: colors.ink },
  cardDagen: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.accentDark },
  cardMeta: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink },
  impact: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  conflictCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 5 },
  conflictText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  aanvraagRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aanvraagPeriode: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  aanvraagMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});