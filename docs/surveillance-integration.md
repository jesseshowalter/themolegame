# Surveillance — integration note (Phase 0)

Where the online **Surveillance** game plugs into this repo, and how it reuses
the existing auth/session system. Read alongside the full build spec.

## Current stack

- **Frontend:** Vite + React 18 + TypeScript, `react-router-dom` v6 (SPA). Routes
  in `src/App.tsx`; player screens in `src/pages/`; host dashboard in
  `src/pages/Host.tsx`. Deployed on Vercel (static build).
- **Backend:** Supabase (Postgres). **There is no custom app server.** The client
  talks to Postgres directly with the **anon key** (`src/lib/supabase.ts`).
  Secrets are protected two ways:
  - **RLS** on tables (permissive for party data; locked for secrets).
  - **`SECURITY DEFINER` RPCs** gated by a host passcode (`app_config.host_passcode`)
    or by identity — e.g. the Mole's identity lives in the RLS-locked
    `mole_assignment` table and is only reachable through `mole_check` /
    `admin_get_mole`. This is the existing anti-cheat pattern and the model to
    copy for Surveillance's server-authoritative secrets.
- **Realtime / state sync:** Supabase Realtime `postgres_changes` subscriptions.
  The phase state machine can be a row other clients subscribe to (see
  `WaitRoom.tsx`, `Host.tsx`, `Quiz.tsx` for the pattern: subscribe to a table,
  re-evaluate on change).

## Auth / session reuse (lobby join)

Reuse the existing login-code system as-is:
- **Roster:** `players` table. Guests pick their identity in `src/pages/PlayLogin.tsx`.
- **Login:** optional per-player password via the `verify_password` RPC; the
  session is stored client-side by `src/lib/session.ts` (`getSession()` /
  `saveSession()`), holding `{ id, name, codename, avatar }`.
- **Host:** the passcode gate in `Host.tsx` (`VITE_HOST_PASSCODE`, matched to
  `app_config.host_passcode`). The neutral operator for CONFIRM is this host.

A Surveillance lobby = a session row + the existing player roster. No new auth.

## Where the game code lives

- **Pure logic (done, Phase 1):** `src/games/surveillance/`
  - `types.ts` — data model (`SurveillanceMap`, `MapObject`, `Camera`, `PlayerReport`, `CameraView`).
  - `logic.ts` — `deriveTruth`, `validateMap`, `getCameraView`, `aggregateReports`, `scoreRound`.
  - `maps/downtownBranch.ts` — validated reference map.
  - `logic.test.ts` — unit tests (`npm test`, Vitest).
- **UI (later phases):** player screens under `src/pages/` (or `src/games/surveillance/`),
  wired into `src/App.tsx`; host controls as a new tab/section in `Host.tsx`.

## ⚠️ Architecture decision for Phases 3+ (the masking boundary)

Invariant §7.1 requires that **a client never receives another camera's objects,
the truth, or the Mole's identity before REVEAL**, and that masking is enforced
**server-side**. The current anon-key-direct-to-Postgres model **cannot** enforce
this by itself — if the full map is readable by the client, hiding it in the UI
violates the invariant.

Two viable paths (decide before building Phase 3):

1. **Supabase Edge Functions (recommended).** A Deno serverless function is the
   authoritative game server: it holds the full map + truth + mole assignment,
   and returns **only** `getCameraView(map, yourCam)` per request. It can import
   this same `logic.ts` (one source of truth) for masking and `scoreRound`.
   Clients still use Realtime to observe phase changes, but all secret-bearing
   payloads come through the function.

2. **RLS-locked tables + `SECURITY DEFINER` RPCs** (mirrors the existing Mole
   secrecy model). Store maps/objects in tables with `revoke all` from anon;
   expose `get_camera_view(session, player)`, `submit_report(...)`,
   `lock_answer(...)`, `reveal(...)` RPCs that enforce masking and scoring in
   plpgsql. No new runtime, but the game logic is reimplemented in SQL.

Recommendation: **Path 1** — reuse the TS `logic.ts` we just built inside an Edge
Function so masking/scoring live in one place, with the mole assignment and
per-player reports in RLS-locked tables (Path 2 pattern) for the secrets.

## Status

- **Phase 0:** this note. ✅
- **Phase 1:** data model + validator + reference map + unit tests. ✅ (`npm test`)
- **Phase 2+:** not started (blocked on the masking-boundary decision above).
