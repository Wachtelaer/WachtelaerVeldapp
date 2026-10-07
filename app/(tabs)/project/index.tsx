import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { colors, fonts } from '@/lib/theme';

export default function ProjectScreen() {
  return (
    <View style={styles.root}>
      <AppHeader kicker="Project · enkel zichtbaar voor jou" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Nieuw project</Text>
        <Text style={styles.subtitle}>
          Dit tabblad is enkel zichtbaar voor jouw account — nog in opbouw. Zeg wat erin moet komen en dat bouwen we
          hier verder uit.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, lineHeight: 20 },
});
