import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, NumberField, TextArea, TextField } from '@/components/ui/Form';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { createFormulier } from '@/lib/api/formulieren';
import { enqueueFormulier, useConnectivity } from '@/lib/offlineQueue';
import { getFormTemplate, type FormKey } from '@/lib/formTemplates';
import { missingVelden } from '@/lib/salesModules';
import { colors, fonts } from '@/lib/theme';

export default function FormulierInvulScreen() {
  const { form: formKey } = useLocalSearchParams<{ form: FormKey }>();
  const template = getFormTemplate(formKey);
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [kNaam, setKNaam] = useState('');
  const [kAdres, setKAdres] = useState('');
  const [kTel, setKTel] = useState('');
  const [antwoorden, setAntwoorden] = useState<Record<string, unknown>>({});
  const [nota, setNota] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setVeld = (id: string, waarde: unknown) => setAntwoorden((prev) => ({ ...prev, [id]: waarde }));

  const leeg = [...(kNaam.trim() ? [] : ['klantnaam']), ...missingVelden(template, antwoorden)];
  const ontbreekt = leeg.length ? leeg.join(' · ') : 'Niets — dit formulier is volledig ingevuld.';

  const submit = async () => {
    if (!profile || !kNaam.trim()) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      invullerId: profile.id,
      formulier: template.key,
      klantNaam: kNaam.trim(),
      klantAdres: kAdres.trim(),
      klantTel: kTel.trim(),
      antwoorden,
      nota: nota.trim(),
      fotoUris,
    };
    try {
      if (isOnline) await createFormulier(payload);
      else await enqueueFormulier(payload);
      router.replace({
        pathname: '/meer/formulieren/klaar',
        params: { offline: isOnline ? '0' : '1', formNaam: template.naam, klantNaam: kNaam.trim() },
      });
    } catch (e: any) {
      setError(e.message ?? 'Formulier versturen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker={`Formulier · ${template.naam}`} />
      <BackRow label="Ander formulier" onPress={() => router.replace('/meer/formulieren')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <SectionLabel>{template.naam}</SectionLabel>
          <Text style={styles.title}>Bij de klant</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ gap: 8 }}>
          <FieldLabel>Klant</FieldLabel>
          <TextField value={kNaam} onChangeText={setKNaam} placeholder="Naam" />
          <TextField value={kAdres} onChangeText={setKAdres} placeholder="Adres" />
          <TextField value={kTel} onChangeText={setKTel} placeholder="Telefoon of e-mail" />
        </View>

        {template.velden.map((v) => (
          <View key={v.id} style={{ gap: 7 }}>
            <FieldLabel>{v.label}</FieldLabel>
            {v.kind === 'keuze' ? (
              <ChipGroup opties={v.opties ?? []} value={antwoorden[v.id] as string} onChange={(val) => setVeld(v.id, val)} />
            ) : null}
            {v.kind === 'chips' ? (
              <ChipGroup
                opties={v.opties ?? []}
                value={antwoorden[v.id] as string[]}
                onChange={(val) => setVeld(v.id, val)}
                multi
              />
            ) : null}
            {v.kind === 'getal' ? (
              <NumberField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                eenheid={v.eenheid ?? ''}
              />
            ) : null}
            {v.kind === 'tekst' ? (
              <TextField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                placeholder={v.ph}
              />
            ) : null}
            {v.kind === 'datum' ? (
              <DatePickerField value={(antwoorden[v.id] as string) || ''} onChange={(val) => setVeld(v.id, val)} />
            ) : null}
            {v.hintTekst ? <Text style={styles.hint}>{v.hintTekst}</Text> : null}
          </View>
        ))}

        <View style={{ gap: 8 }}>
          <FieldLabel>{`Foto (${fotoUris.length})`}</FieldLabel>
          <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
        </View>

        <View style={{ gap: 6 }}>
          <FieldLabel>Nota (optioneel)</FieldLabel>
          <TextArea value={nota} onChangeText={setNota} placeholder="Bijkomende opmerkingen" />
        </View>

        <View style={styles.ontbreektCard}>
          <SectionLabel>Ontbreekt nog</SectionLabel>
          <Text style={styles.ontbreektText}>{ontbreekt}</Text>
        </View>

        <Button
          label={isOnline ? 'Formulier opslaan' : 'Opslaan in wachtrij'}
          onPress={submit}
          loading={submitting}
          disabled={!kNaam.trim()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 18, paddingBottom: 48 },
  title: { fontFamily: fonts.headingBold, fontSize: 25, textTransform: 'uppercase', color: colors.ink, marginTop: 4 },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted, lineHeight: 16 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  ontbreektCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 5 },
  ontbreektText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
});
