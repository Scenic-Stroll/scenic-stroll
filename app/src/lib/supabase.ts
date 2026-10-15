/**
 * The single Supabase client used by the whole app.
 *
 * Only the PUBLIC values live here (project URL + publishable key). They are safe in the app
 * because Row Level Security decides what each user can read/write. Secret keys (LLM, routing,
 * service role) live only in Edge Function secrets — never in this app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// EXPO_PUBLIC_* vars are inlined at build time from app/.env — they must be read with dot notation.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False when app/.env is missing — screens show a setup hint instead of crashing. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  // Placeholders keep the app booting without .env; every request will fail until it's set.
  supabaseUrl ?? 'http://localhost:54321',
  supabasePublishableKey ?? 'missing-key',
  {
    auth: {
      storage: AsyncStorage, // keep the (anonymous) session across app restarts
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // no browser redirects in a native app
    },
  },
);

// Only refresh the auth token while the app is in the foreground (recommended by Supabase for RN).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
