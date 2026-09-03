import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile } from '@/components/ui/Basics';
import { ChipGroup, FieldLabel, TextArea, TextField } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { listAlleWerven } from '@/lib/api/werven';
import {
  createTaak,
  deleteTaak,
  listAlleTaken,
  listMijnTaken,
  listToewijsbareProfielen,
  zetGedaan,
  type TaakListItem,
} from '@/lib/api/taken';
import { colors, fonts } from '@/lib/theme';

const GEEN_WERF = 'Geen specifieke werf';

export default function TodoScreen() {
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';

  return (
    <View style={styles.root}>
      <AppHeader kicker={isMgmt ? 'To do · beheer' : 'To do'} />
      {isMgmt ? <BeheerView /> : <MijnTakenView />}
    </View>
  );
}

function TaakCard({
  taak,
  toonToegewezenAan,
  busy,
  onToggle,
  onDelete,
}: {
  taak: TaakListItem;
  toonToegewezenAan: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  const metaBits = [
    toonToegewezenAan ? taak.toegewezenAanNaam : `door ${taak.aangemaaktDoorNaam}`,
    taak.werfNaam,
    formatDatum(taak.created_at),
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHead} onPress={onToggle} disabled={busy} accessibilityRole="button">
        <View style={[styles.checkbox, taak.gedaan && styles.checkboxOn]}>
          {busy ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : taak.gedaan ? (
            <Ionicons name="checkmark" size={14} color={colors.white} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitel, taak.gedaan && styles.cardTitelGedaan]}>{taak.titel}</Text>
          <Text style={styles.cardMeta}>{metaBits.join(' · ')}</Text>
        </View>
        {onDelete ? (
          <TouchableOpacity onPress={onDelete} accessibilityRole="button" style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={17} color={colors.inkMuted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      {taak.omschrijving ? <Text style={styles.cardOmschrijving}>{taak.omschrijving}</Text> : null}
    </View>
  );
}

function MijnTakenView() {
  const { profile } = useAuth();
  const [taken, setTaken] = useState<TaakListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setTaken(await listMijnTaken(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon taken niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (taak: TaakListItem) => {
    setBusyId(taak.id);
    try {
      await zetGedaan(taak.id, !taak.gedaan);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon taak niet bijwerken');
    } finally {
      setBusyId(null);
    }
  };

  const open = taken?.filter((t) => !t.gedaan) ?? [];
  const gedaan = taken?.filter((t) => t.gedaan) ?? [];

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>To do</Text>
        <Text style={styles.subtitle}>Taken die management aan jou heeft toegewezen.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {taken === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
      {taken?.length === 0 ? <Text style={styles.empty}>Nog geen taken toegewezen.</Text> : null}

      {open.map((t) => (
        <TaakCard key={t.id} taak={t} toonToegewezenAan={false} busy={busyId === t.id} onToggle={() => toggle(t)} />
      ))}

      {gedaan.length > 0 ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={styles.gedaanLabel}>{`Afgerond (${gedaan.length})`}</Text>
          {gedaan.map((t) => (
            <TaakCard key={t.id} taak={t} toonToegewezenAan={false} busy={busyId === t.id} onToggle={() => toggle(t)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function BeheerView() {
  const { profile } = useAuth();
  const [taken, setTaken] = useState<TaakListItem[] | null>(null);
  const [profielen, setProfielen] = useState<{ id: string; naam: string }[]>([]);
  const [werven, setWerven] = useState<{ id: string; naam: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [toegewezenAanNaam, setToegewezenAanNaam] = useState('');
  const [werfNaam, setWerfNaam] = useState(GEEN_WERF);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [t, p, w] = await Promise.all([listAlleTaken(), listToewijsbareProfielen(), listAlleWerven()]);
      setTaken(t);
      setProfielen(p);
      setWerven(w);
    } catch (e: any) {
      setError(e.message ?? 'Kon taken niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (taak: TaakListItem) => {
    setBusyId(taak.id);
    try {
      await zetGedaan(taak.id, !taak.gedaan);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon taak niet bijwerken');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (taak: TaakListItem) => {
    setBusyId(taak.id);
    try {
      await deleteTaak(taak.id);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon taak niet verwijderen');
    } finally {
      setBusyId(null);
    }
  };

  const openAdd = () => {
    setTitel('');
    setOmschrijving('');
    setToegewezenAanNaam(profielen[0]?.naam ?? '');
    setWerfNaam(GEEN_WERF);
    setAddError(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!profile) return;
    const toegewezenAan = profielen.find((p) => p.naam === toegewezenAanNaam);
    if (!titel.trim()) {
      setAddError('Vul een titel in');
      return;
    }
    if (!toegewezenAan) {
      setAddError('Kies aan wie je deze taak toewijst');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const werf = werven.find((w) => w.naam === werfNaam);
      await createTaak({
        titel: titel.trim(),
        omschrijving: omschrijving.trim(),
        toegewezenAan: toegewezenAan.id,
        werfId: werf?.id ?? null,
        aangemaaktDoor: profile.id,
      });
      setAddOpen(false);
      await load();
    } catch (e: any) {
      setAddError(e.message ?? 'Kon taak niet aanmaken');
    } finally {
      setAdding(false);
    }
  };

  const openTaken = taken?.filter((t) => !t.gedaan) ?? [];

  return (
    <>
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>To do</Text>
          <Text style={styles.subtitle}>Wijs taken toe aan medewerkers en volg wat afgerond is.</Text>
        </View>

        <View style={styles.kpiRow}>
          <KpiTile value={String(openTaken.length)} label="open" />
          <KpiTile value={String(taken?.length ?? 0)} label="totaal" />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {taken === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {taken?.length === 0 ? <Text style={styles.empty}>Nog geen taken.</Text> : null}

        {taken?.map((t) => (
          <TaakCard
            key={t.id}
            taak={t}
            toonToegewezenAan
            busy={busyId === t.id}
            onToggle={() => toggle(t)}
            onDelete={() => remove(t)}
          />
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd} accessibilityRole="button">
          <Text style={styles.addBtnText}>+ nieuwe taak</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Text style={styles.sheetTitle}>Nieuwe taak</Text>

              <FieldLabel>Titel</FieldLabel>
              <TextField value={titel} onChangeText={setTitel} placeholder="Bv. Ladder terugbrengen naar werf X" />

              <FieldLabel>Omschrijving (optioneel)</FieldLabel>
              <TextArea value={omschrijving} onChangeText={setOmschrijving} placeholder="Extra details" />

              <FieldLabel>Toegewezen aan</FieldLabel>
              <ChipGroup opties={profielen.map((p) => p.naam)} value={toegewezenAanNaam} onChange={(v) => setToegewezenAanNaam(v as string)} />

              {werven.length > 0 ? (
                <>
                  <FieldLabel>Werf (optioneel)</FieldLabel>
                  <ChipGroup
                    opties={[GEEN_WERF, ...werven.map((w) => w.naam)]}
                    value={werfNaam}
                    onChange={(v) => setWerfNaam(v as string)}
                  />
                </>
              ) : null}

              {addError ? <Text style={styles.error}>{addError}</Text> : null}

              <View style={styles.sheetRow}>
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setAddOpen(false)} accessibilityRole="button">
                  <Text style={styles.sheetCancelText}>Annuleren</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetConfirm, adding && styles.sheetConfirmDisabled]}
                  onPress={submitAdd}
                  disabled={adding}
                  accessibilityRole="button">
                  {adding ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sheetConfirmText}>Aanmaken</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: -4 },
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
  gedaanLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  cardTitel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  cardTitelGedaan: { color: colors.inkMuted, textDecorationLine: 'line-through' },
  cardMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  cardOmschrijving: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18, paddingLeft: 34 },
  deleteBtn: { padding: 4 },
  addBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addBtnText: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.accentDark },
  backdrop: { flex: 1, backgroundColor: 'rgba(29,31,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, maxHeight: '85%', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, padding: 16 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  sheetRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  sheetCancel: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink },
  sheetConfirm: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirmDisabled: { opacity: 0.5 },
  sheetConfirmText: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.white },
});
