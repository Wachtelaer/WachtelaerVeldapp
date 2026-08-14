import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Niet gevonden' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Dit scherm bestaat niet.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Terug naar start</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: colors.bg },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.ink },
  link: { marginTop: 15, paddingVertical: 15 },
  linkText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.accent },
});
