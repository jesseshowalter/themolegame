/**
 * Quick Supabase connection check — run LOCALLY (this repo's cloud environment
 * can't reach Supabase due to its network policy).
 *
 *   1. cp .env.example .env   # and fill in your values
 *   2. npm install
 *   3. node scripts/test-connection.mjs
 *
 * A pass means: your URL + anon key work, the schema is loaded, and RLS lets
 * the app read the roster.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Minimal .env loader (no dependency needed).
function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env file — fall back to real environment variables */
  }
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('\n❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  console.error('   Copy .env.example to .env and fill them in first.\n');
  process.exit(1);
}

const supabase = createClient(url, key);

console.log(`\n🔌 Connecting to ${url} ...\n`);

const checks = [];
async function check(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.log(`❌ ${label}: ${error.message}`);
    checks.push(false);
  } else {
    console.log(`✅ ${label}: ${Array.isArray(data) ? data.length : data} row(s)`);
    checks.push(true);
  }
  return data;
}

const players = await check(
  'players (roster)',
  supabase.from('players').select('id,name', { count: 'exact' })
);
await check('quizzes (rounds)', supabase.from('quizzes').select('round_number,title,status'));
await check(
  'public_questions (answer key hidden)',
  supabase.from('public_questions').select('id')
);
await check('leaderboard (view)', supabase.from('leaderboard').select('player_id').limit(1));

// Confirm the anti-cheat: the anon key must NOT be able to read the raw answers.
const { error: cheatErr } = await supabase.from('questions').select('correct_index').limit(1);
if (cheatErr) {
  console.log('✅ anti-cheat: answer key is NOT readable by players (as intended)');
  checks.push(true);
} else {
  console.log('⚠️  anti-cheat: players CAN read the questions table — re-run schema.sql');
  checks.push(false);
}

if (players?.length) {
  console.log(`\n   Sample roster: ${players.slice(0, 3).map((p) => p.name).join(', ')}${players.length > 3 ? ' …' : ''}`);
}

const ok = checks.every(Boolean);
console.log(
  ok
    ? '\n🟢 ALL CHECKS PASSED — Supabase is connected and the schema is live.\n'
    : '\n🔴 Some checks failed — see above. Re-run supabase/schema.sql + seed.sql if needed.\n'
);
process.exit(ok ? 0 : 1);
