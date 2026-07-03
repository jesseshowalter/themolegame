-- ============================================================================
-- Host tools add-on — run ONCE in the Supabase SQL editor if you set up the DB
-- before these features existed. (schema.sql now includes all of this too, but
-- re-running schema.sql would wipe your data, so use this incremental file.)
--
-- Enables:
--   1. The host "Reset game" button (permission to clear answers).
--   2. Seeing the correct answer highlighted in the per-round question editor,
--      WITHOUT exposing the answer key to players.
-- ============================================================================

-- 1) Let the host clear all answers on reset --------------------------------
drop policy if exists responses_delete on public.responses;
create policy responses_delete on public.responses for delete using (true);

-- 2) Handler-only answer-key access -----------------------------------------
-- A tiny config table holds the handler passcode. RLS + no policy means players
-- (the anon role) can never read it; the SECURITY DEFINER function below can.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- IMPORTANT: set this to match your VITE_HOST_PASSCODE (in Vercel / .env).
-- Default matches the app's fallback passcode 'mole-master'. To change later:
--   update public.app_config set value = 'YOUR_PASSCODE' where key = 'host_passcode';
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
