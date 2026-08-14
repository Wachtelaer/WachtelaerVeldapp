import { Redirect } from 'expo-router';

import { useAuth } from '@/context/AuthProvider';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Redirect href={session ? '/werven' : '/sign-in'} />;
}
