import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import type { Quiz } from '../lib/types';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import ConfigBanner from '../components/ConfigBanner';

export default function WaitRoom() {
  const navigate = useNavigate();
  const session = getSession();
  // First name of the logged-in player, for personalized wait copy.
  const agentName = (session?.name?.trim().split(/\s+/)[0] || 'AGENT').toUpperCase();
  const [eliminated, setEliminated] = useState(false);
  const [completedRound, setCompletedRound] = useState<Quiz | null>(null);
  const [checking, setChecking] = useState(true);

  // Decide where the player should be: into an open round they haven't finished,
  // eliminated screen, or a holding pattern.
  const evaluate = useCallback(async () => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    setChecking(true);

    const { data: me } = await supabase
      .from('players')
      .select('is_eliminated')
      .eq('id', session.id)
      .maybeSingle();
    if (me?.is_eliminated) {
      setEliminated(true);
      setChecking(false);
      return;
    }

    const { data: open } = await supabase
      .from('quizzes')
      .select('*')
      .eq('status', 'open')
      .order('round_number')
      .limit(1)
      .maybeSingle();

    if (!open) {
      setCompletedRound(null);
      setChecking(false);
      return;
    }

    // Has this player already answered every question in the open round?
    const [{ count: qCount }, { count: rCount }] = await Promise.all([
      supabase
        .from('public_questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', open.id),
      supabase
        .from('responses')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', open.id)
        .eq('player_id', session.id),
    ]);

    if ((qCount ?? 0) > 0 && (rCount ?? 0) >= (qCount ?? 0)) {
      setCompletedRound(open); // finished — hold until next round
      setChecking(false);
    } else {
      navigate(`/play/quiz/${open.id}`, { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }
    evaluate();
    const channel = supabase
      .channel('waitroom')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes' }, evaluate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, evaluate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session && isSupabaseConfigured) return null;

  return (
    <TerminalChrome
      agentName={session?.name}
      avatarUrl={session?.avatar}
      status={eliminated ? 'TERMINATED' : 'STANDBY'}
    >
      <div className="header">
        <Wordmark size={52} />
      </div>

      <ConfigBanner />

      <div className="status-center">
        {eliminated ? (
          <>
            <div className="eliminated-banner">// AGENT TERMINATED</div>
            <p className="status-sub">
              You have been eliminated from the field.
              <br />
              Remain in position and observe. The Mole is still among us.
            </p>
          </>
        ) : checking ? (
          <p className="status-sub cursor">SCANNING FOR ACTIVE TRANSMISSION</p>
        ) : completedRound ? (
          <>
            <p className="mono-label">// {completedRound.title} — RESPONSES LOCKED</p>
            <h2 className="status-headline">GOOD WORK, {agentName}</h2>
            <p className="status-sub cursor">AWAITING NEXT DIRECTIVE</p>
          </>
        ) : (
          <>
            <p className="mono-label">// NO ACTIVE ROUND</p>
            <h2 className="status-headline">STAND BY, {agentName}</h2>
            <p className="status-sub cursor">
              The next quiz opens when the host initiates it
            </p>
          </>
        )}
      </div>
    </TerminalChrome>
  );
}
