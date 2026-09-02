import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { authLinkError } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

const LINK_ERROR_MESSAGE =
  'Deze uitnodigings- of wachtwoordlink is niet meer geldig (verlopen, al gebruikt, of te snel geopend door de beveiliging van je mailprogramma). Vraag management om een nieuwe uitnodiging te sturen.';

export default function SignInScreen() {
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(authLinkError ? LINK_ERROR_MESSAGE : null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const { error: signInError } = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (signInError) setError(signInError);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Wachtelaer</Text>
        <Text style={styles.brandSub}>Veldapp</Text>
      </View>
      <View style={styles.form}>
        <Text style={styles.label}>E-mailadres</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="voornaam@wachtelaer.be"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
        />
        <Text style={styles.label}>Wachtwoord</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          onSubmitEditing={onSubmit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ marginTop: 8 }}>
          <Button label="Aanmelden" onPress={onSubmit} loading={loading} disabled={!email || !password} />
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
