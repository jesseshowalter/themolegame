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

> **Already set up before the host tools existed?** Run [`supabase/host-tools.sql`](supabase/host-tools.sql) once. It enables **editing and deleting questions**, **removing players**, the **Reset game** button, and **highlighting correct answers** for the host without exposing them to guests. Set the handler passcode in that file to match your `VITE_HOST_PASSCODE`. Fresh runs of `schema.sql` already include all of this.

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

The **`/host`** screen is organized into four tabs: **Rounds**, **Standings**
(live scores + eliminate), **Players** (manage the roster — add, rename, upload an
avatar, designate the mole, set a login password, remove), and **Advanced** (bulk
JSON import + reset game).

Each round has **two phases**, shown as a row of two cards in the **Rounds** tab:
- **Mission** (left) — the physical challenge. **BRIEFING ›** edits the public
  briefing; **Send** shows it to **every player, mole included** (so a glance at
  another screen never gives the mole away). Close it when the challenge is done.
- **Quiz** (right) — **QUESTIONS ›** edits questions; **Open** starts the quiz.
  Players take it in private; the mole instead sees their objectives for the
  **next** mission — safe to reveal while everyone's off in their own corner.

Only one phase is live at a time — sending a mission or opening a quiz closes
whatever else was open. Avatars are uploaded in the player **Edit** flow (resized and stored inline
— no external storage needed) and show on the login roster.

1. On your laptop, open **`/join`** and project/show it — or open **`/host`** to drive the game.
2. Guests scan the QR → land on `/play` → tap their name → they're in, sitting on the **STAND BY** screen.
3. In **`/host`**, hit **Open** on Round 1. Every guest's phone flips into the quiz automatically.
4. When everyone's answered, hit **Close**. Look at the **Standings** table — it's sorted **worst score first**, and the elimination candidate is highlighted in red.
5. Decide who's out and hit **Eliminate**. Their device shows *AGENT TERMINATED*; they're greyed out on your board (you can **Revive** if you change your mind).
6. Repeat for Rounds 2–4. Use the **Cumulative / R1–R4** toggle to score a single round or the whole night.
7. Ran a practice game? Scroll to **Danger zone → Reset** to wipe answers/eliminations and re-lock the rounds before the real thing.

> Scoring reflects the classic Mole format: questions are about the Mole's real
> identity/actions (which only you know). Whoever knows the Mole *least* scores
> lowest — that's your elimination.

---

## Authoring your night

### Edit questions per round from the host screen (easiest)
In **`/host`**, each round card has a **QUESTIONS ›** button. It opens a full-page
editor for that round where you can:
- **Add** a question — type the prompt, choose Multiple choice or True/False, fill
  the options, and **click a letter (A/B/C…) to mark the correct answer**.
- **Edit** or **Delete** any existing question.
- Add questions **on the fly during the event** — great for improvising.

Hit **← Dashboard** to return to round controls and the leaderboard.

> **Seeing the correct answer:** once you've run [`supabase/host-tools.sql`](supabase/host-tools.sql)
> and set the handler passcode to match your `VITE_HOST_PASSCODE`, the editor
> **highlights the correct option** (green ✓) and pre-fills it when you edit —
> while guests still can't read the answer key. Until then, correct answers stay
> hidden and you re-pick them when editing.

### Bulk import (optional)
For pasting many questions at once, expand **Bulk import questions (paste JSON)**
at the bottom of `/host`. Click **Load template**, paste your set, and hit
**Upload** — it validates live and replaces each included round's questions
(rounds you leave out are untouched). The JSON format is forgiving:
```jsonc
{
  "rounds": [
    {
      "round": 1,                       // or "round_number"
      "title": "BRIEFING",
      "subtitle": "Establish the field.",   // optional
      "questions": [
        {
          "prompt": "WHO WAS SEEN EXITING THE COMPOUND?",
          "type": "mc",                 // "mc" (default) or "tf"
          "options": ["A", "B", "C", "D"],
          "correct": 2,                  // 0-based index, or a letter like "C"
          "meta_id": "MOLE-1-032",       // optional flavor line
          "meta_coord": "52.37° N"       // optional flavor line
        },
        {
          "prompt": "THE MOLE'S DIRECTIVE IS SABOTAGE.",
          "type": "tf",                  // options default to TRUE / FALSE
          "correct": true                // boolean ok for true/false
        }
      ]
    }
  ]
}
```

### Or edit the tables directly
Everything is data — edit it in the Supabase **Table Editor** or by re-running a
tweaked `seed.sql`.

- **Roster** → `players` table. Add a row per guest (`name`, optional `codename`). Delete the samples.
- **Rounds** → `quizzes` table. Four rows, `round_number` 1–4, with a `title`/`subtitle`. Leave them `locked`; you open them from `/host`.
- **Questions** → `questions` table:
  - `type`: `mc` (multiple choice) or `tf` (true/false)
  - `options`: a JSON array of choice labels, e.g. `["Option A","Option B"]`
  - `correct_index`: the 0-based index of the right answer (guests never see this)
  - `meta_id` / `meta_coord`: optional flavor text under the question (e.g. `MOLE-X-032`)

### Reset the game
**`/host` → Danger zone → Reset** clears every answer, brings all eliminated
players back, and re-locks all rounds — your roster and questions stay put.
Perfect for wiping a practice run before the real night.

### Player passwords
To stop guests from tapping into each other's accounts (especially the mole's),
give players a login password: **Players tab → Edit → Login password**. The play
screen then asks for it when someone taps that account. Passwords are stored in
an RLS-locked table (guests can't read them; only a public "has password" flag is
exposed) and checked server-side. Hand them out on physical notes. Leave blank
for no password. Requires [`supabase/passwords.sql`](supabase/passwords.sql) once.

### The Mole
Pick one player to secretly play the saboteur:
- **Designate** them with **Set Mole** on their row in the **Players** tab (only one at a time; toggle off to clear).
- **Brief** them per round: open a round's **QUESTIONS** editor and fill the **Mole orders** box — one sabotage instruction per line. The pre-game briefing has its own **Mole orders** box for the first mission.
- The mole **never takes the quiz**. During the **mission** they see the same public briefing as everyone. Every **quiz** is the mole's prep window: while the others answer, their phone shows a classified *"YOU ARE THE MOLE"* screen with the sabotage orders you wrote in **that round's** editor — their plan for the next challenge. The very first mission is prepped in the **pre-game briefing** instead (a tap-to-reveal *"YOUR ROUND 1 ORDERS"* section, mole-only), since there's no quiz before it. In short: **what you write in a round's editor shows during that round's quiz; the pre-game briefing covers mission one.**
- The mole **can't be eliminated** and is excluded from the worst-score flag; the Standings tab marks them and shows *protected* instead of an eliminate button.

**Secrecy:** the mole's identity and their briefings live in RLS-locked tables that guests' key can't read, kept out of realtime, and reached only through passcode-gated (host) or mole-only functions — so a player inspecting the app can't see who the mole is. Because login is passwordless, a *determined* technical guest could still probe player-by-player; a strong `VITE_HOST_PASSCODE` (matched in the DB) protects the host-only reads. Good enough for a party; ask if you want per-player token hardening.

### Bookend briefings
Extra briefings frame the four rounds on the **Rounds** tab:
- **Pre-game operation briefing** (above round one) — the rules of the game plus strategy tips / what to watch for. Edit it with **BRIEFING ›**, then **Launch Briefing** to push the rules screen to every phone.
- **Endgame** (below round four) — two cards, launched in sequence:
  - **Final briefing / the verdict** — **Send Final Briefing** pushes your closing instructions to everyone (e.g. "write who you think the Mole is on your whiteboard and reveal on my word").
  - **The reveal** — **Reveal the Mole** unmasks the mole on every player's phone (name, codename, avatar) with a staged declassify animation and your closing message. The mole's identity only becomes readable to players while the reveal is open (via the `reveal_mole()` function), so it stays secret until you launch it.

Like missions, only one briefing/quiz is ever live at a time, and **Reset** re-locks them all. Requires [`supabase/briefings.sql`](supabase/briefings.sql) once (fresh runs of `schema.sql` already include it).

---

## Project structure

```
supabase/
  schema.sql        tables, grading trigger, leaderboard view, RLS, realtime
  seed.sql          sample roster + 4 rounds of questions
  host-tools.sql    one-time add-on: delete policy for the Reset button
  briefings.sql     one-time add-on: pre-game + endgame briefings + reveal RPC
src/
  lib/
    supabase.ts        client (reads VITE_ env vars)
    types.ts           DB types
    session.ts         device-local "instant login" session
    importQuestions.ts parser/validator for the host question uploader
  components/        TerminalChrome, Wordmark, Chevron, ConfigBanner, useUptime
    RoundEditor.tsx    per-round add/edit/delete question editor
    PlayersPanel.tsx   roster management (add / rename / eliminate / remove)
  pages/
    PlayLogin.tsx    roster grid + instant login effect
    WaitRoom.tsx     holding screen; realtime-routes into open rounds
    Quiz.tsx         the question screen (matches Figma)
    Done.tsx         post-round confirmation
    Host.tsx         passcode gate, round controls, leaderboard, upload + reset
    Join.tsx         QR code portal
  index.css          design tokens (colors, fonts, scanlines)
  styles.css         screen + component styles
scripts/
  test-connection.mjs  local Supabase connection check (npm run test:db)
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
