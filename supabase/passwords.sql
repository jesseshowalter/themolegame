-- ============================================================================
-- Per-player login passwords — run ONCE in the Supabase SQL editor.
-- The password itself lives in an RLS-locked table (no anon access, kept out of
-- realtime) so guests can never read each other's — only a public has_password
-- flag is exposed. The host sets it via a passcode-gated function; the play
-- screen verifies it server-side at login.
-- ============================================================================
alter table public.players
  add column if not exists has_password boolean not null default false;

create table if not exists public.player_passwords (
  player_id uuid primary key references public.players(id) on delete cascade,
  password  text not null
);
alter table public.player_passwords enable row level security;
revoke all on public.player_passwords from anon, authenticated;

-- Host sets/clears a player's password (empty clears it).
create or replace function public.admin_set_password(p_passcode text, p_player uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  if p_password is null or length(trim(p_password)) = 0 then
    delete from public.player_passwords where player_id = p_player;
    update public.players set has_password = false where id = p_player;
  else
    insert into public.player_passwords (player_id, password) values (p_player, trim(p_password))
      on conflict (player_id) do update set password = excluded.password;
    update public.players set has_password = true where id = p_player;
  end if;
end; $$;

-- Login check — true if the password matches (or none is set).
create or replace function public.verify_password(p_player uuid, p_password text)
returns boolean language plpgsql security definer set search_path = public as $$
declare stored text;
begin
  select password into stored from public.player_passwords where player_id = p_player;
  if stored is null then return true; end if;
  return trim(coalesce(p_password, '')) = stored;
end; $$;

revoke all on function public.admin_set_password(text, uuid, text) from public;
revoke all on function public.verify_password(uuid, text)          from public;
grant execute on function public.admin_set_password(text, uuid, text) to anon, authenticated;
grant execute on function public.verify_password(uuid, text)          to anon, authenticated;

create or replace function public.admin_get_password(p_passcode text, p_player uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_passcode is distinct from (select value from public.app_config where key='host_passcode') then
    raise exception 'unauthorized';
  end if;
  return (select password from public.player_passwords where player_id = p_player);
end; $$;
revoke all on function public.admin_get_password(text, uuid) from public;
grant execute on function public.admin_get_password(text, uuid) to anon, authenticated;
