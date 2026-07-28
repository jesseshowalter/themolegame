-- ============================================================================
-- Bookend + endgame briefings. All are broadcast just like mission briefings —
-- they reuse quizzes.mission_status / quizzes.mission_briefing — but carry no
-- quiz questions. They live at sentinel round numbers so the normal rounds
-- (1..N) are untouched:
--   round 0   = pre-game OPERATION BRIEFING (rules + strategy)
--   round 99  = endgame FINAL BRIEFING / VERDICT (whiteboard vote instructions)
--   round 100 = endgame REVEAL (who the mole was + closing message)
--
-- Safe to run more than once. Existing installs keep their round 99 row; this
-- adds round 100 and (re)points reveal_mole() at it.
-- ============================================================================

insert into public.quizzes (round_number, title, mission_briefing)
values
  (0,   'PRE-GAME', ''),
  (99,  'VERDICT',  ''),
  (100, 'REVEAL',   '')
on conflict (round_number) do nothing;

-- Reveal the mole to everyone — but ONLY once the host has launched the REVEAL
-- (round 100 mission open). Until then this returns no rows, so the mole stays
-- secret. SECURITY DEFINER because mole_assignment is RLS-locked.
create or replace function public.reveal_mole()
returns table(name text, codename text, avatar_url text)
language sql security definer set search_path = public stable as $$
  select p.name, p.codename, p.avatar_url
  from public.mole_assignment m
  join public.players p on p.id = m.player_id
  where m.id = 1
    and exists (
      select 1 from public.quizzes q
      where q.round_number = 100 and q.mission_status = 'open'
    );
$$;

revoke all on function public.reveal_mole() from public;
grant execute on function public.reveal_mole() to anon, authenticated;
