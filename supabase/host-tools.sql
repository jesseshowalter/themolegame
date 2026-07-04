-- ============================================================================
-- Host tools add-on — run ONCE in the Supabase SQL editor if you set up the DB
-- before these features existed. (schema.sql now includes all of this too, but
-- re-running schema.sql would wipe your data, so use this incremental file.)
-- Safe to re-run; every statement is idempotent.
--
-- Enables:
--   1. Editing AND deleting questions from the /host editor.
--   2. The "Reset game" button (permission to clear answers).
--   3. Seeing the correct answer highlighted in the editor, WITHOUT exposing
--      the answer key to players.
-- ============================================================================

-- 1) Let the host EDIT and DELETE questions ---------------------------------
-- Postgres requires SELECT privilege on any column used in a WHERE clause, so
-- UPDATE/DELETE ... WHERE id = ... fails without it. We grant SELECT on every
-- column EXCEPT correct_index, so edits/deletes work while the answer key stays
-- unreadable (anti-cheat intact).
grant select (id, quiz_id, order_index, prompt, type, options, points, meta_id, meta_coord)
  on public.questions to anon, authenticated;

-- 2) Let the host clear all answers on reset, and remove players ------------
drop policy if exists responses_delete on public.responses;
create policy responses_delete on public.responses for delete using (true);
drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete using (true);

-- 3) Handler-only answer-key access -----------------------------------------
-- A tiny config table holds the handler passcode. RLS + no policy means players
-- (the anon role) can never read it; the SECURITY DEFINER function below can.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- IMPORTANT: this MUST equal the passcode you type to enter /host
-- (your VITE_HOST_PASSCODE in Vercel). Default matches the app fallback
-- 'mole-master'. If your /host passcode is different, change it here or run:
--   update public.app_config set value = 'YOUR_HOST_PASSCODE' where key = 'host_passcode';
insert into public.app_config (key, value) values ('host_passcode', 'mole-master')
  on conflict (key) do nothing;

-- Returns full questions (including correct_index) but ONLY when the caller
-- supplies the handler passcode. Players read public_questions instead and
-- never receive the answer key.
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
