import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { colors, fonts } from '@/lib/theme';

export function ComingSoon({ titel, tekst }: { titel: string; tekst: string }) {
  return (
    <View style={styles.root}>
      <AppHeader kicker={titel} />
      <View style={styles.body}>
        <Ionicons name="construct-outline" size={28} color={colors.accent} />
        <Text style={styles.title}>{titel}</Text>
        <Text style={styles.text}>{tekst}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { fontFamily: fonts.heading, fontSize: 20, textTransform: 'uppercase', color: colors.ink },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, textAlign: 'center' },
});
