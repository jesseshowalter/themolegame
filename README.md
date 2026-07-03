# THE MOLE // Party Quiz Terminal

A spy-terminal quiz app for running a *The Mole*–themed murder-mystery night.
10–12 guests scan a QR code, tap their name to instantly "log in," and take
**four quizzes** over the course of the evening. You — the host — watch a live
elimination dashboard and knock out whoever knows the least about the Mole.

Built with **React + Vite + TypeScript** and **Supabase** (Postgres + Realtime),
designed to deploy on **Vercel**. UI matches the Figma spy-terminal design.

---

## What's in the box

| Route | Who | Purpose |
|-------|-----|---------|
| `/play` | Guests (QR target) | Roster login → wait room → quiz → done |
| `/host` | You | Passcode-gated round controls + elimination leaderboard |
| `/join` | You (project on a screen) | Big scannable QR code that points guests at `/play` |

**Key design choices** (locked in during planning):
- **Instant login** — no passwords. Guests tap their name from a preset roster; the device remembers them across all four rounds.
- **Auto-graded** — every question has one correct answer (the truth about the Mole). Scores compute instantly; the leaderboard sorts itself worst-first.
- **Multiple-choice + true/false** questions.
- **Anti-cheat** — the answer key lives in a column guests literally cannot read (Postgres column privileges + a server-side grading trigger), so nobody can pop open dev tools and find the answers.
- **Realtime** — when you open or close a round from `/host`, every guest's phone reacts instantly.

---

## Setup (about 15 minutes)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a name and a strong database password.
2. Once it's ready, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

### 2. Load the database
In the Supabase dashboard, open **SQL Editor → New query** and run, in order:
1. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**. This creates the tables, the grading trigger, the leaderboard view, security policies, and enables realtime.
2. Paste the contents of [`supabase/seed.sql`](supabase/seed.sql) → **Run**. This loads a sample 12-person roster and all four rounds so you can test immediately. **Swap the names and questions for your own** later (see "Authoring your night" below).

### 3. Configure and run locally
```bash
cp .env.example .env      # then edit .env
npm install
npm run dev               # http://localhost:5173
```
Fill `.env` with:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_HOST_PASSCODE=pick-something   # gate for /host
```
Open `http://localhost:5173/play` — you should see the roster instead of the
"TERMINAL OFFLINE" banner.

### 4. Deploy to Vercel
1. Push this repo to GitHub, then **Import** it at [vercel.com](https://vercel.com).
2. In the Vercel project's **Environment Variables**, add the same three `VITE_…` values.
3. Deploy. Vercel gives you a URL like `https://the-mole.vercel.app`.
4. `vercel.json` already rewrites all routes to `index.html` so deep links (`/host`, `/play/quiz/...`) work.

---

## Running the night

1. On your laptop, open **`/join`** and project/show it — or open **`/host`** to drive the game.
2. Guests scan the QR → land on `/play` → tap their name → they're in, sitting on the **STAND BY** screen.
3. In **`/host`**, hit **Open** on Round 1. Every guest's phone flips into the quiz automatically.
4. When everyone's answered, hit **Close**. Look at the **Standings** table — it's sorted **worst score first**, and the elimination candidate is highlighted in red.
5. Decide who's out and hit **Eliminate**. Their device shows *AGENT TERMINATED*; they're greyed out on your board (you can **Revive** if you change your mind).
6. Repeat for Rounds 2–4. Use the **Cumulative / R1–R4** toggle to score a single round or the whole night.

> Scoring reflects the classic Mole format: questions are about the Mole's real
> identity/actions (which only you know). Whoever knows the Mole *least* scores
> lowest — that's your elimination.

---

## Authoring your night

Everything is data — edit it in the Supabase **Table Editor** or by re-running a
tweaked `seed.sql`.

- **Roster** → `players` table. Add a row per guest (`name`, optional `codename`). Delete the samples.
- **Rounds** → `quizzes` table. Four rows, `round_number` 1–4, with a `title`/`subtitle`. Leave them `locked`; you open them from `/host`.
- **Questions** → `questions` table:
  - `type`: `mc` (multiple choice) or `tf` (true/false)
  - `options`: a JSON array of choice labels, e.g. `["Option A","Option B"]`
  - `correct_index`: the 0-based index of the right answer (guests never see this)
  - `meta_id` / `meta_coord`: optional flavor text under the question (e.g. `MOLE-X-032`)

---

## Project structure

```
supabase/
  schema.sql        tables, grading trigger, leaderboard view, RLS, realtime
  seed.sql          sample roster + 4 rounds of questions
src/
  lib/
    supabase.ts      client (reads VITE_ env vars)
    types.ts         DB types
    session.ts       device-local "instant login" session
  components/        TerminalChrome, Wordmark, Chevron, ConfigBanner, useUptime
  pages/
    PlayLogin.tsx    roster grid + instant login effect
    WaitRoom.tsx     holding screen; realtime-routes into open rounds
    Quiz.tsx         the question screen (matches Figma)
    Done.tsx         post-round confirmation
    Host.tsx         passcode gate + round controls + elimination leaderboard
    Join.tsx         QR code portal
  index.css          design tokens (colors, fonts, scanlines)
  styles.css         screen + component styles
```

## Scripts
- `npm run dev` — local dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build locally

---

## Security notes for a party context
This is built for a room of people you trust. On one shared anon key:
- The **answer key is genuinely protected** (column privileges + `SECURITY DEFINER` grading), so guests can't cheat by inspecting network traffic.
- Roster tap-in, round status, and elimination are intentionally permissive so the game is frictionless. Don't reuse this Supabase project for anything sensitive, and rotate the anon key after the party if you like.
