/**
 * Lightweight "instant login" session — no passwords. When a player taps their
 * name on the roster we stash their id/name on the device. This persists across
 * the four rounds of the night.
 */
import type { Player } from './types';

const KEY = 'the-mole:player';

export interface Session {
  id: string;
  name: string;
  codename: string | null;
  avatar: string | null;
}

export function saveSession(
  player: Pick<Player, 'id' | 'name' | 'codename' | 'avatar_url'>
): Session {
  const session: Session = {
    id: player.id,
    name: player.name,
    codename: player.codename,
    avatar: player.avatar_url ?? null,
  };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

/** Derived codename fallback, e.g. "Jesse Showalter" -> "AGENT_J_SHOWALTER". */
export function codenameFor(name: string, codename?: string | null): string {
  if (codename) return codename;
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '';
  return `AGENT_${first}_${last}`.toUpperCase().replace(/[^A-Z0-9_]/g, '');
}
