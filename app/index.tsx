import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthProvider';

export default function Index() {
  const { session, loading, needsPasswordSetup } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (needsPasswordSetup) return <Redirect href="/nieuw-wachtwoord" />;
  return <Redirect href="/werven" />;
}
