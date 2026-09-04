import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, Tag } from '@/components/ui/Basics';
import { ChipGroup, FieldLabel, TextField } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { getWerf, listAlleWerven } from '@/lib/api/werven';
import { getPlanUrl, listDocumenten, markPlannenRead, uploadPlan, type DocumentMetVersies } from '@/lib/api/plannen';
import type { Werf } from '@/lib/database.types';
import { colors, fonts } from '@/lib/theme';

interface PendingFile {
  uri: string;
  name: string;
  mimeType: string;
  titel: string;
}

export default function PlannenWerfScreen() {
  const { werfId } = useLocalSearchParams<{ werfId: string }>();
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';

  const [werf, setWerf] = useState<Werf | null>(null);
  const [documenten, setDocumenten] = useState<DocumentMetVersies[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voortgang, setVoortgang] = useState<{ done: number; total: number } | null>(null);
  const [alleWerven, setAlleWerven] = useState<{ id: string; naam: string }[]>([]);
  const [doelWerfNaam, setDoelWerfNaam] = useState<string>('');

  const load = useCallback(async () => {
    if (!werfId || !profile) return;
    try {
      setError(null);
      const [w, docs] = await Promise.all([getWerf(werfId), listDocumenten(werfId, profile.id)]);
      setWerf(w);
      setDocumenten(docs);
      await markPlannenRead(werfId, profile.id);
      if (isMgmt && alleWerven.length === 0) {
        setAlleWerven(await listAlleWerven());
      }
    } catch (e: any) {
      setError(e.message ?? 'Kon plannen niet laden');
    }
  }, [werfId, profile, isMgmt, alleWerven.length]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openVersie = async (storagePath: string) => {
    const url = await getPlanUrl(storagePath);
    if (url) Linking.openURL(url);
  };

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
    if (result.canceled || !result.assets?.length) return;
    setPendingFiles(
      result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType || 'application/octet-stream',
        titel: a.name.replace(/\.[^./]+$/, ''),
      }))
    );
    setDoelWerfNaam(werf?.naam ?? alleWerven[0]?.naam ?? '');
  };

  const updateFileTitel = (index: number, titel: string) => {
    setPendingFiles((prev) => prev.map((f, i) => (i === index ? { ...f, titel } : f)));
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmUpload = async () => {
    const doelWerf = alleWerven.find((w) => w.naam === doelWerfNaam);
    if (!doelWerf || !profile || pendingFiles.length === 0 || pendingFiles.some((f) => !f.titel.trim())) return;
    setUploading(true);
    setVoortgang({ done: 0, total: pendingFiles.length });
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        await uploadPlan({
          werfId: doelWerf.id,
          titel: file.titel.trim(),
          fileUri: file.uri,
          fileName: file.name,
          mimeType: file.mimeType,
          geuploadDoor: profile.id,
        });
        setVoortgang({ done: i + 1, total: pendingFiles.length });
      }
      setPendingFiles([]);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Uploaden mislukt');
    } finally {
      setUploading(false);
      setVoortgang(null);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker={werf ? `${werf.code} · plannen` : 'Plannen'} />
      <BackRow label="Plannen" onPress={() => router.replace('/plannen')} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Plannen &amp; documenten</Text>
        <Text style={styles.subtitle}>Altijd de laatste versie. Wie de oude versie open had, krijgt een melding.</Text>

        {documenten === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {documenten?.length === 0 ? <Text style={styles.empty}>Nog geen plannen voor deze werf.</Text> : null}

        {documenten?.map((d) => (
          <View key={d.id} style={styles.docCard}>
            <TouchableOpacity
              style={styles.docRow}
              onPress={() => openVersie(d.laatsteVersie.storage_path)}
              accessibilityRole="button">
              <View style={styles.fileIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.accentDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitel} numberOfLines={1}>
                  {d.titel}
                </Text>
                <Text style={styles.docMeta}>
                  {`versie ${d.laatsteVersie.versie_nummer} · ${formatDatum(d.laatsteVersie.created_at)} · ${d.laatsteVersie.uploaderNaam}`}
                </Text>
              </View>
              {d.isNieuw ? <Tag label="nieuw" tone="accent" /> : null}
            </TouchableOpacity>

            {d.vorigeVersies.length > 0 ? (
              <TouchableOpacity
                style={styles.oudereToggle}
                onPress={() => setExpandedId(expandedId === d.id ? null : d.id)}
                accessibilityRole="button">
                <Text style={styles.oudereToggleText}>
                  {expandedId === d.id ? 'verberg oudere versies' : `${d.vorigeVersies.length} oudere versie(s)`}
                </Text>
              </TouchableOpacity>
            ) : null}

            {expandedId === d.id
              ? d.vorigeVersies.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.oudereRow}
                    onPress={() => openVersie(v.storage_path)}
                    accessibilityRole="button">
                    <Text style={styles.oudereRowText}>
                      {`versie ${v.versie_nummer} · ${formatDatum(v.created_at)} · ${v.uploaderNaam}`}
                    </Text>
                  </TouchableOpacity>
                ))
              : null}
          </View>
        ))}

        {isMgmt ? (
          <TouchableOpacity style={styles.addBtn} onPress={pickFiles} accessibilityRole="button">
            <Text style={styles.addBtnText}>+ plannen of pdf's toevoegen</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal visible={pendingFiles.length > 0} transparent animationType="fade" onRequestClose={() => setPendingFiles([])}>
        <Pressable style={styles.backdrop} onPress={() => setPendingFiles([])}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Text style={styles.sheetTitle}>{`${pendingFiles.length} document(en) toevoegen`}</Text>

              <FieldLabel>Werf</FieldLabel>
              <ChipGroup opties={alleWerven.map((w) => w.naam)} value={doelWerfNaam} onChange={(v) => setDoelWerfNaam(v as string)} />

              <FieldLabel>Titel per bestand</FieldLabel>
              {pendingFiles.map((file, i) => (
                <View key={file.uri + i} style={styles.fileRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.sheetFile} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <TextField
                      value={file.titel}
                      onChangeText={(v) => updateFileTitel(i, v)}
                      placeholder="Titel van het document"
                    />
                  </View>
                  {pendingFiles.length > 1 ? (
                    <TouchableOpacity onPress={() => removeFile(i)} accessibilityRole="button" style={styles.fileRemove}>
                      <Ionicons name="close" size={16} color={colors.inkMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}

              <Text style={styles.sheetHint}>
                Bestaat er al een document met deze titel op de gekozen werf? Dan wordt dit een nieuwe versie ervan.
              </Text>

              {voortgang ? (
                <Text style={styles.sheetHint}>{`Bezig met uploaden: ${voortgang.done}/${voortgang.total}`}</Text>
              ) : null}

              <View style={styles.sheetRow}>
                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => setPendingFiles([])}
                  disabled={uploading}
                  accessibilityRole="button">
                  <Text style={styles.sheetCancelText}>Annuleren</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sheetConfirm,
                    (pendingFiles.some((f) => !f.titel.trim()) || !doelWerfNaam || uploading) && styles.sheetConfirmDisabled,
                  ]}
                  onPress={confirmUpload}
                  disabled={pendingFiles.some((f) => !f.titel.trim()) || !doelWerfNaam || uploading}
                  accessibilityRole="button">
                  {uploading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.sheetConfirmText}>{`Uploaden (${pendingFiles.length})`}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  error: { fontFamily: fonts.body, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  docCard: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11 },
  fileIcon: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  docMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  oudereToggle: { paddingHorizontal: 11, paddingBottom: 9 },
  oudereToggleText: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.accentDark, textTransform: 'uppercase' },
  oudereRow: { paddingHorizontal: 11, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  oudereRowText: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted },
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
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink,
    padding: 16,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  sheetFile: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted },
  fileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fileRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted, lineHeight: 16 },
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