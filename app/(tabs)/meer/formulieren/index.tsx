import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, SectionLabel, Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { FORM_TEMPLATES, getFormTemplate } from '@/lib/formTemplates';
import { listMijnFormulieren, type FormulierListItem } from '@/lib/api/formulieren';
import { colors, fonts } from '@/lib/theme';

export default function FormulierenScreen() {
  const { profile } = useAuth();
  const [mijnFormulieren, setMijnFormulieren] = useState<FormulierListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setMijnFormulieren(await listMijnFormulieren(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon formulieren niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.root}>
      <AppHeader kicker="Formulieren" />
      <BackRow label="Meer" onPress={() => router.replace('/meer')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Formulieren</Text>
          <Text style={styles.subtitle}>Kies een formulier om in te vullen bij de klant.</Text>
        </View>

        {FORM_TEMPLATES.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.card}
            onPress={() => router.push(`/meer/formulieren/${f.key}`)}
            accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitel}>{f.naam}</Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {f.sub}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.accent} />
          </TouchableOpacity>
        ))}

        <View>
          <SectionLabel>Mijn formulieren</SectionLabel>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {mijnFormulieren === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
          {mijnFormulieren?.length === 0 ? <Text style={styles.empty}>Nog geen formulieren ingevuld.</Text> : null}
          {mijnFormulieren?.map((f) => (
            <View key={f.id} style={styles.rijRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rijTitel} numberOfLines={1}>
                  {`${getFormTemplate(f.formulier).naam} — ${f.klant_naam || '(naam ontbreekt)'}`}
                </Text>
                <Text style={styles.rijMeta}>{formatDatum(f.created_at)}</Text>
              </View>
              {f.fotoCount > 0 ? <Tag label={`${f.fotoCount} foto's`} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  card: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitel: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  cardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  rijRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rijTitel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  rijMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});
