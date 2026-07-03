-- ============================================================================
-- Host tools add-on — run ONCE in the Supabase SQL editor if you already ran
-- schema.sql before these features existed. (schema.sql now includes this too,
-- but re-running schema.sql would wipe your data, so use this incremental file.)
--
-- Adds a DELETE policy on responses so the host "Reset game" button can clear
-- every answer. Everything else the host tools need (upserting quizzes,
-- inserting/deleting questions, updating players) is already permitted.
-- ============================================================================

drop policy if exists responses_delete on public.responses;
create policy responses_delete on public.responses for delete using (true);
