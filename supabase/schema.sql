-- ============================================================================
-- THE MOLE // party quiz — database schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Safe to re-run: it drops and recreates everything.
-- ============================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- Clean slate ----------------------------------------------------------------
drop view   if exists public.leaderboard        cascade;
drop view   if exists public.public_questions   cascade;
drop table  if exists public.responses          cascade;
drop table  if exists public.questions          cascade;
drop table  if exists public.quizzes            cascade;
drop table  if exists public.players            cascade;

-- ============================================================================
-- Tables
-- ============================================================================

-- The preset roster you load before the party.
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  codename      text,                       -- e.g. AGENT_J_SMITH (optional)
  avatar_url    text,
  is_eliminated boolean not null default false,
  joined_at     timestamptz,                -- set the first time they tap in
  created_at    timestamptz not null default now()
);

-- The four rounds of the night.
create table public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  round_number  int not null unique,
  title         text not null,
  subtitle      text,
  status        text not null default 'locked'
                  check (status in ('locked', 'open', 'closed')),
  created_at    timestamptz not null default now()
);

-- Questions belong to a round. correct_index is the answer key (kept private).
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  order_index   int not null default 0,
  prompt        text not null,
  type          text not null default 'mc' check (type in ('mc', 'tf')),
  options       jsonb not null default '[]'::jsonb,  -- ["A label","B label",...]
  correct_index int not null default 0,              -- index into options
  points        int not null default 1,
  meta_id       text,                                -- flavor: "MOLE-X-032"
  meta_coord    text                                 -- flavor: "52.37° N, 4.89° E"
);
create index questions_quiz_idx on public.questions (quiz_id, order_index);

-- One row per player per question. is_correct is graded server-side.
create table public.responses (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id)  on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  quiz_id       uuid not null references public.quizzes(id)   on delete cascade,
  answer_index  int not null,
  is_correct    boolean not null default false,
  answered_at   timestamptz not null default now(),
  unique (player_id, question_id)            -- lets us upsert an answer change
);
create index responses_quiz_idx on public.responses (quiz_id);

-- ============================================================================
-- Grading: compute is_correct on the server so clients can't fake a score.
-- SECURITY DEFINER lets this read questions.correct_index even though the
-- anon role cannot select that column directly.
-- ============================================================================
create or replace function public.grade_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key int;
begin
  select correct_index into key from public.questions where id = new.question_id;
  new.is_correct := (new.answer_index = key);
  new.answered_at := now();
  return new;
end;
$$;

create trigger trg_grade_response
  before insert or update of answer_index on public.responses
  for each row execute function public.grade_response();

-- ============================================================================
-- Views
-- ============================================================================

-- Player-facing question feed WITHOUT the answer key (anti-cheat).
create view public.public_questions as
  select id, quiz_id, order_index, prompt, type, options, points, meta_id, meta_coord
  from public.questions;

-- The host's elimination tool: score per player per round.
-- Sort ascending by score to find who did worst.
create view public.leaderboard as
  select
    p.id                              as player_id,
    p.name,
    p.codename,
    p.is_eliminated,
    q.id                              as quiz_id,
    q.round_number,
    count(r.id)                       as answered_count,
    count(r.id) filter (where r.is_correct)                     as correct_count,
    coalesce(sum(case when r.is_correct then qs.points else 0 end), 0) as score
  from public.players p
  cross join public.quizzes q
  left join public.responses r on r.player_id = p.id and r.quiz_id = q.id
  left join public.questions qs on qs.id = r.question_id
  group by p.id, p.name, p.codename, p.is_eliminated, q.id, q.round_number;

-- ============================================================================
-- Row Level Security
-- Party context: trusted guests on one anon key. We keep the ONE thing that
-- would break the game (the answer key) private, and otherwise stay permissive.
-- ============================================================================
alter table public.players   enable row level security;
alter table public.quizzes   enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

-- players: everyone can read the roster; anyone can update (tap-in + host eliminate).
create policy players_read   on public.players for select using (true);
create policy players_update on public.players for update using (true) with check (true);
create policy players_insert on public.players for insert with check (true);
create policy players_delete on public.players for delete using (true);

-- quizzes: everyone reads; host opens/closes rounds.
create policy quizzes_read   on public.quizzes for select using (true);
create policy quizzes_update on public.quizzes for update using (true) with check (true);
create policy quizzes_insert on public.quizzes for insert with check (true);

-- questions: NO direct select for players (hides correct_index). Host tools can
-- still write. Players read via the public_questions view below.
create policy questions_write on public.questions for all using (true) with check (true);

-- responses: players submit and revise their own answers; host reads all and
-- can clear them all via the "Reset game" host tool.
create policy responses_read   on public.responses for select using (true);
create policy responses_insert on public.responses for insert with check (true);
create policy responses_update on public.responses for update using (true) with check (true);
create policy responses_delete on public.responses for delete using (true);

-- Column access: the anon role must NOT read questions directly, but MUST read
-- the safe view and the leaderboard.
revoke all on public.questions from anon, authenticated;
grant  select on public.public_questions to anon, authenticated;
grant  select on public.leaderboard       to anon, authenticated;
-- Host still needs to author questions through the app (insert/update/delete):
grant  insert, update, delete on public.questions to anon, authenticated;
-- Postgres requires SELECT on columns used in a WHERE clause, so UPDATE/DELETE
-- ... WHERE id = ... needs column SELECT. Grant every column EXCEPT the answer
-- key, so the host can edit/delete questions while correct_index stays hidden.
grant  select (id, quiz_id, order_index, prompt, type, options, points, meta_id, meta_coord)
  on public.questions to anon, authenticated;

-- ============================================================================
-- Realtime: push round open/close and live answers to connected clients.
-- ============================================================================
alter publication supabase_realtime add table public.quizzes;
alter publication supabase_realtime add table public.responses;
alter publication supabase_realtime add table public.players;

-- ============================================================================
-- Handler-only answer-key access (for the /host question editor).
-- Players never get correct_index; the host reads it via a passcode-gated
-- SECURITY DEFINER function.
-- ============================================================================
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Set to match your VITE_HOST_PASSCODE. Default matches the app fallback.
insert into public.app_config (key, value) values ('host_passcode', 'mole-master')
  on conflict (key) do nothing;

create or replace function public.admin_questions(p_passcode text, p_quiz uuid)
returns setof public.questions
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key = 'host_passcode') then
    raise exception 'unauthorized';
  end if;
  return query
    select * from public.questions where quiz_id = p_quiz order by order_index;
end;
$$;
revoke all on function public.admin_questions(text, uuid) from public;
grant execute on function public.admin_questions(text, uuid) to anon, authenticated;

-- ============================================================================
-- THE MOLE — secret mole assignment + per-round briefings.
-- RLS-locked, no anon policies, kept OUT of realtime. Accessed only via
-- SECURITY DEFINER functions (host functions gated by the handler passcode).
-- ============================================================================
create table if not exists public.mole_assignment (
  id        int primary key default 1 check (id = 1),
  player_id uuid references public.players(id) on delete set null
);
insert into public.mole_assignment (id, player_id) values (1, null)
  on conflict (id) do nothing;
alter table public.mole_assignment enable row level security;
revoke all on public.mole_assignment from anon, authenticated;

create table if not exists public.mole_briefings (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  body    text not null default ''
);
alter table public.mole_briefings enable row level security;
revoke all on public.mole_briefings from anon, authenticated;

create or replace function public.admin_get_mole(p_passcode text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  return (select player_id from public.mole_assignment where id = 1);
end; $$;

create or replace function public.admin_set_mole(p_passcode text, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  update public.mole_assignment set player_id = p_player where id = 1;
end; $$;

create or replace function public.admin_get_mole_briefing(p_passcode text, p_quiz uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  return coalesce((select body from public.mole_briefings where quiz_id = p_quiz), '');
end; $$;

create or replace function public.admin_set_mole_briefing(p_passcode text, p_quiz uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  insert into public.mole_briefings (quiz_id, body) values (p_quiz, coalesce(p_body, ''))
    on conflict (quiz_id) do update set body = excluded.body;
end; $$;

create or replace function public.mole_check(p_player uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.mole_assignment where id = 1 and player_id = p_player);
$$;

create or replace function public.mole_briefing(p_player uuid, p_quiz uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.mole_assignment where id = 1 and player_id = p_player) then
    return null;
  end if;
  return coalesce((select body from public.mole_briefings where quiz_id = p_quiz), '');
end; $$;

revoke all on function public.admin_get_mole(text)                      from public;
revoke all on function public.admin_set_mole(text, uuid)                from public;
revoke all on function public.admin_get_mole_briefing(text, uuid)       from public;
revoke all on function public.admin_set_mole_briefing(text, uuid, text) from public;
revoke all on function public.mole_check(uuid)                          from public;
revoke all on function public.mole_briefing(uuid, uuid)                 from public;
grant execute on function public.admin_get_mole(text)                      to anon, authenticated;
grant execute on function public.admin_set_mole(text, uuid)                to anon, authenticated;
grant execute on function public.admin_get_mole_briefing(text, uuid)       to anon, authenticated;
grant execute on function public.admin_set_mole_briefing(text, uuid, text) to anon, authenticated;
grant execute on function public.mole_check(uuid)                          to anon, authenticated;
grant execute on function public.mole_briefing(uuid, uuid)                 to anon, authenticated;
