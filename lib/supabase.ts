import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.'
  );
}

// Checked synchronously, before Supabase's own async URL-session handling
// (triggered by detectSessionInUrl below) gets a chance to run. That
// handling can resolve — and fire its one-shot PASSWORD_RECOVERY event —
// before AuthProvider's useEffect has subscribed to onAuthStateChange, so
// relying on the event alone silently drops invite/reset-password links
// on a fast page load (the person lands straight in the app, having
// never set a password). This flag is the reliable source of truth;
// the event listener in AuthProvider is just a backup.
export const isPasswordSetupLink =
  Platform.OS === 'web' && typeof window !== 'undefined' && /type=(invite|recovery)/.test(window.location.hash);

// A failed invite/reset link (expired, already clicked once, or consumed
// early by a corporate email link-scanner before the person themselves
// clicked it — common with Outlook/M365 "Safe Links") lands back here with
// #error=...&error_description=... instead of a usable session. Without
// this, the person silently ends up on the plain sign-in form with no clue
// why, and understandably guesses at a password they never set — which is
// exactly the "invalid login credentials" dead end this flags instead.
export const authLinkError =
  Platform.OS === 'web' && typeof window !== 'undefined' && /[#&]error=/.test(window.location.hash);

// No generic Database type here: this hand-maintained schema doesn't include
// full relationship metadata, and supabase-js's typed embedded-resource
// selects (e.g. `profiles(full_name)`) need that to type-check. The api/
// modules annotate their own return types instead. Regenerate with
// `supabase gen types typescript` once there's a live project to introspect,
// then reinstate `createClient<Database>(...)`.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Invite/reset-password links land back on the web app with the
    // session tokens in the URL hash — only relevant on web, and native
    // has no URL bar for this to apply to.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
