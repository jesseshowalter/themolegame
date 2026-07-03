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
