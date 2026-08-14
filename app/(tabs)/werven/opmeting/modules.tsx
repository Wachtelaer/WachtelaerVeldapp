import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { BackRow } from '@/components/ui/Basics';
import { SALES_MODULES } from '@/lib/salesModules';
import { colors, fonts } from '@/lib/theme';

export default function ModulesScreen() {
  return (
    <View style={styles.root}>
      <AppHeader kicker="Opmeting · domein kiezen" />
      <BackRow label="Terug" onPress={() => router.replace('/werven')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Text style={styles.title}>Wat gaan we meten?</Text>
          <Text style={styles.subtitle}>
            Per domein een eigen vragenlijst — enkel wat de backoffice nodig heeft om de offerte te kunnen maken.
          </Text>
        </View>
        {SALES_MODULES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={styles.card}
            onPress={() => router.push(`/werven/opmeting/${m.key}`)}
            accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitel}>{m.naam}</Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {m.sub}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.accent} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
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
});
