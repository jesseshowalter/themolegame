import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Live `is_eliminated` flag for a single player.
 *
 * Elimination is deliberately NOT stored in the session (see lib/session.ts) —
 * it can change mid-game, so we read it from the DB and subscribe to this
 * player's row for realtime updates. Returns false until the first read.
 */
export function useEliminated(playerId?: string): boolean {
  const [eliminated, setEliminated] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !playerId) return;

    let active = true;
    supabase
      .from('players')
      .select('is_eliminated')
      .eq('id', playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setEliminated(!!data?.is_eliminated);
      });

    const channel = supabase
      .channel(`elim-${playerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` },
        (payload) => setEliminated(!!(payload.new as { is_eliminated?: boolean }).is_eliminated)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  return eliminated;
}
