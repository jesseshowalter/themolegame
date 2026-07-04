-- ============================================================================
-- Mission phase add-on — run ONCE in the Supabase SQL editor.
-- Adds a per-round MISSION (the physical challenge) alongside the quiz: its own
-- open/close status and a public briefing shown to players when you send it.
-- (schema.sql already includes these for fresh installs.)
-- ============================================================================
alter table public.quizzes
  add column if not exists mission_status text not null default 'locked'
    check (mission_status in ('locked', 'open', 'closed')),
  add column if not exists mission_briefing text not null default '';
