import { isSupabaseConfigured } from '../lib/supabase';

/**
 * Shown when the app is opened before Supabase is wired up. Keeps the UI from
 * silently failing during setup.
 */
export default function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="banner">
      <strong>// TERMINAL OFFLINE — database not connected.</strong>
      <br />
      Copy <code>.env.example</code> to <code>.env</code> and set{' '}
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your
      Supabase project (Settings → API), then run <code>npm run dev</code> again. See{' '}
      <code>README.md</code> for the full setup.
    </div>
  );
}
