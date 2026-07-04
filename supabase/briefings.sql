-- ============================================================================
-- Bookend briefings: a pre-game OPERATION BRIEFING (rules + strategy) and an
-- ENDGAME reveal (who the mole was + thank you). Both are broadcast just like
-- mission briefings — they reuse quizzes.mission_status / quizzes.mission_briefing
-- — but they carry no quiz questions. They live at sentinel round numbers so
-- the normal rounds (1..N) are untouched:
--   round 0  = pre-game operation briefing
--   round 99 = endgame reveal / debrief
--
-- Safe to run more than once.
-- ============================================================================

insert into public.quizzes (round_number, title, mission_briefing)
values
  (0,  'PRE-GAME', ''),
  (99, 'ENDGAME',  '')
on conflict (round_number) do nothing;

-- Reveal the mole to everyone — but ONLY once the host has launched the endgame
-- briefing (round 99 mission open). Until then this returns no rows, so the
-- mole stays secret. SECURITY DEFINER because mole_assignment is RLS-locked.
create or replace function public.reveal_mole()
returns table(name text, codename text, avatar_url text)
language sql security definer set search_path = public stable as $$
  select p.name, p.codename, p.avatar_url
  from public.mole_assignment m
  join public.players p on p.id = m.player_id
  where m.id = 1
    and exists (
      select 1 from public.quizzes q
      where q.round_number = 99 and q.mission_status = 'open'
    );
$$;

revoke all on function public.reveal_mole() from public;
grant execute on function public.reveal_mole() to anon, authenticated;
