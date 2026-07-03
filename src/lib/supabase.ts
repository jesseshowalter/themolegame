import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both env vars are present. We surface a friendly banner instead of
 * crashing when the app is opened before Supabase has been wired up.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[the-mole] Supabase env vars missing. Copy .env.example to .env and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key'
);
