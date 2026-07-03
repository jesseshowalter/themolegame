-- ============================================================================
-- THE MOLE // sample data — run AFTER schema.sql to test the full flow.
-- Replace the roster names and question content with your own party's.
-- Safe to re-run: it clears players/quizzes first.
-- ============================================================================

truncate table public.responses, public.questions, public.quizzes, public.players
  restart identity cascade;

-- ---- Roster (swap for your 10–12 guests) -----------------------------------
insert into public.players (name, codename) values
  ('Alex Rivera',    'AGENT_A_RIVERA'),
  ('Blair Chen',     'AGENT_B_CHEN'),
  ('Casey Morgan',   'AGENT_C_MORGAN'),
  ('Devon Park',     'AGENT_D_PARK'),
  ('Emerson Wolfe',  'AGENT_E_WOLFE'),
  ('Frankie Diaz',   'AGENT_F_DIAZ'),
  ('Gray Sullivan',  'AGENT_G_SULLIVAN'),
  ('Harper Quinn',   'AGENT_H_QUINN'),
  ('Indie Larsen',   'AGENT_I_LARSEN'),
  ('Jordan Blake',   'AGENT_J_BLAKE'),
  ('Kai Nakamura',   'AGENT_K_NAKAMURA'),
  ('Logan Reyes',    'AGENT_L_REYES');

-- ---- Four rounds -----------------------------------------------------------
insert into public.quizzes (round_number, title, subtitle, status) values
  (1, 'BRIEFING',      'Establish the field. Trust no one.',      'open'),
  (2, 'SURVEILLANCE',  'The Mole has been busy. Have you watched?', 'locked'),
  (3, 'INTERROGATION', 'Contradictions surface under pressure.',   'locked'),
  (4, 'ENDGAME',       'One identity remains. Commit to it.',       'locked');

-- ---- Questions -------------------------------------------------------------
-- helper pattern: reference quiz by round_number via subquery.

-- ROUND 1 — BRIEFING
insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 0,
  'WHO WAS SEEN EXITING THE COMPOUND AT PRECISELY 02:45 HOURS ON THE NIGHT OF THE HEIST?',
  'mc',
  '["The person who spent the most time in the kitchen.","The person who currently holds the exemption.","The person with the hidden fingerprint in their dossier.","The person who volunteered for the search mission.","The person wearing the red tactical jacket.","None of the above."]'::jsonb,
  2, 'MOLE-1-032', '52.3702° N, 4.8952° E'
from public.quizzes where round_number = 1;

insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 1,
  'THE MOLE''S PRIMARY DIRECTIVE FOR TONIGHT IS SABOTAGE.',
  'tf', '["TRUE","FALSE"]'::jsonb, 0, 'MOLE-1-033', '51.5074° N, 0.1278° W'
from public.quizzes where round_number = 1;

insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 2,
  'WHICH ASSET FAILED THE FIRST CHALLENGE ON PURPOSE?',
  'mc',
  '["Asset in seat one.","Asset who counted the votes.","Asset with the encrypted phone.","The quiet one at the back."]'::jsonb,
  1, 'MOLE-1-034', '48.8566° N, 2.3522° E'
from public.quizzes where round_number = 1;

-- ROUND 2 — SURVEILLANCE
insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 0,
  'DURING THE BLACKOUT, WHO LEFT THE ROOM WITHOUT AN ALIBI?',
  'mc',
  '["The dealer.","The lookout.","The driver.","The forger.","No one moved."]'::jsonb,
  2, 'MOLE-2-051', '40.7128° N, 74.0060° W'
from public.quizzes where round_number = 2;

insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 1,
  'THE MOLE INTENTIONALLY MISCOUNTED THE POT DURING THE VAULT CHALLENGE.',
  'tf', '["TRUE","FALSE"]'::jsonb, 0, 'MOLE-2-052', '35.6762° N, 139.6503° E'
from public.quizzes where round_number = 2;

-- ROUND 3 — INTERROGATION
insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 0,
  'WHOSE STORY CHANGED BETWEEN THE FIRST AND SECOND DEBRIEF?',
  'mc',
  '["The strategist.","The empath.","The gambler.","The historian."]'::jsonb,
  0, 'MOLE-3-070', '37.7749° N, 122.4194° W'
from public.quizzes where round_number = 3;

insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 1,
  'THE MOLE HAS NEVER HELD THE EXEMPTION.',
  'tf', '["TRUE","FALSE"]'::jsonb, 1, 'MOLE-3-071', '55.7558° N, 37.6173° E'
from public.quizzes where round_number = 3;

-- ROUND 4 — ENDGAME
insert into public.questions (quiz_id, order_index, prompt, type, options, correct_index, meta_id, meta_coord)
select id, 0,
  'FINAL DETERMINATION: WHO IS THE MOLE?',
  'mc',
  '["Agent in the red jacket.","Agent who never guessed wrong.","Agent who stayed silent.","Agent who volunteered first.","Agent with the coldest hands."]'::jsonb,
  1, 'MOLE-4-099', '00.0000° N, 0.0000° E'
from public.quizzes where round_number = 4;
