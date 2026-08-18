import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

export default function NieuwWachtwoordScreen() {
  const { completePasswordSetup } = useAuth();
  const [wachtwoord, setWachtwoord] = useState('');
  const [bevestig, setBevestig] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (wachtwoord.length < 8) {
      setError('Minstens 8 tekens.');
      return;
    }
    if (wachtwoord !== bevestig) {
      setError('De twee wachtwoorden komen niet overeen.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: wachtwoord });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    completePasswordSetup();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Wachtelaer</Text>
        <Text style={styles.brandSub}>Kies je wachtwoord</Text>
      </View>
      <View style={styles.form}>
        <Text style={styles.intro}>
          Welkom! Kies hieronder een wachtwoord om je account in gebruik te nemen.
        </Text>
        <Text style={styles.label}>Nieuw wachtwoord</Text>
        <TextInput
          value={wachtwoord}
          onChangeText={setWachtwoord}
          secureTextEntry
          placeholder="Minstens 8 tekens"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
        />
        <Text style={styles.label}>Bevestig wachtwoord</Text>
        <TextInput
          value={bevestig}
          onChangeText={setBevestig}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          onSubmitEditing={onSubmit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ marginTop: 8 }}>
          <Button label="Wachtwoord instellen" onPress={onSubmit} loading={loading} disabled={!wachtwoord || !bevestig} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, justifyContent: 'center', padding: 24, gap: 40 },
  brandBlock: { gap: 2 },
  brand: {
    fontFamily: fonts.headingBold,
    fontSize: 34,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.white,
  },
  brandSub: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.navyText,
  },
  form: { gap: 8 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.navyText, marginBottom: 8, lineHeight: 20 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.navyText,
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#f2b6b6', marginTop: 12 },
});
