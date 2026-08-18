import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, NumberField, NumberFieldList, Stepper, TextArea, TextField } from '@/components/ui/Form';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { createOpmeting } from '@/lib/api/opmetingen';
import { enqueueOpmeting, useConnectivity } from '@/lib/offlineQueue';
import { getModule, missingVelden, type ModuleKey } from '@/lib/salesModules';
import { colors, fonts } from '@/lib/theme';

export default function IntakeScreen() {
  const { mod: modKey } = useLocalSearchParams<{ mod: ModuleKey }>();
  const mod = getModule(modKey);
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();

  const [kNaam, setKNaam] = useState('');
  const [kAdres, setKAdres] = useState('');
  const [kTel, setKTel] = useState('');
  const [antwoorden, setAntwoorden] = useState<Record<string, unknown>>({});
  const [salesNota, setSalesNota] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const setVeld = (id: string, waarde: unknown) => setAntwoorden((prev) => ({ ...prev, [id]: waarde }));

  const leeg = [
    ...(kNaam.trim() ? [] : ['klantnaam']),
    ...missingVelden(mod, antwoorden),
  ];
  const ontbreekt = leeg.length ? leeg.join(' · ') : 'Niets — dit dossier is volledig voor de backoffice.';

  const submit = async () => {
    if (!profile) return;
    setSubmitting(true);
    const payload = {
      verkoperId: profile.id,
      module: mod.key,
      klantNaam: kNaam.trim(),
      klantAdres: kAdres.trim(),
      klantTel: kTel.trim(),
      antwoorden,
      nota: salesNota.trim(),
      fotoUris,
    };
    try {
      if (isOnline) await createOpmeting(payload);
      else await enqueueOpmeting(payload);
      router.replace({
        pathname: '/werven/opmeting/klaar',
        params: { offline: isOnline ? '0' : '1', modNaam: mod.naam, klantNaam: kNaam.trim() || '(naam ontbreekt)' },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker={`Opmeting · ${mod.naam}`} />
      <BackRow label="Ander domein" onPress={() => router.replace('/werven/opmeting/modules')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <SectionLabel>{`Opmeting · ${mod.naam}`}</SectionLabel>
          <Text style={styles.title}>Bij de klant</Text>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>Klant</FieldLabel>
          <TextField value={kNaam} onChangeText={setKNaam} placeholder="Naam" />
          <TextField value={kAdres} onChangeText={setKAdres} placeholder="Adres" />
          <TextField value={kTel} onChangeText={setKTel} placeholder="Telefoon of e-mail" />
        </View>

        {mod.velden.map((v) => (
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
            {v.kind === 'num' ? (
              <Stepper
                value={(antwoorden[v.id] as number) || 0}
                onChange={(val) => setVeld(v.id, val)}
                eenheid={v.eenheid ?? ''}
              />
            ) : null}
            {v.kind === 'getal' ? (
              <NumberField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                eenheid={v.eenheid ?? ''}
              />
            ) : null}
            {v.kind === 'lijst' ? (
              <NumberFieldList
                count={Math.max(0, Math.floor(Number(antwoorden[v.telVeldId ?? '']) || 0))}
                values={(antwoorden[v.id] as string[]) || []}
                onChange={(vals) => setVeld(v.id, vals)}
                eenheid={v.eenheid ?? ''}
                itemLabel={(i) => `Ruimte ${i + 1}`}
              />
            ) : null}
            {v.kind === 'tekst' ? (
              <TextField
                value={(antwoorden[v.id] as string) || ''}
                onChangeText={(val) => setVeld(v.id, val)}
                placeholder={v.ph}
              />
            ) : null}
            {v.hintTekst ? <Text style={styles.hint}>{v.hintTekst}</Text> : null}
          </View>
        ))}

        <View style={{ gap: 8 }}>
          <FieldLabel>{`Foto's & opmeting`}</FieldLabel>
          <Text style={styles.fotoTip}>{mod.fotoTip}</Text>
          <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
        </View>

        <View style={{ gap: 6 }}>
          <FieldLabel>Wat wil de klant precies?</FieldLabel>
          <TextArea
            value={salesNota}
            onChangeText={setSalesNota}
            placeholder="Klant wil van stookolie weg, budget rond 15k, plaatsing najaar…"
          />
        </View>

        <View style={styles.ontbreektCard}>
          <SectionLabel>Ontbreekt nog</SectionLabel>
          <Text style={styles.ontbreektText}>{ontbreekt}</Text>
        </View>

        <Button
          label={isOnline ? 'Naar backoffice sturen' : 'Opslaan in wachtrij'}
          onPress={submit}
          loading={submitting}
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
  fotoTip: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  ontbreektCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 5 },
  ontbreektText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
});
