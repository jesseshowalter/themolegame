import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import type { Quiz } from '../lib/types';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import ConfigBanner from '../components/ConfigBanner';
import EliminatedBanner from '../components/EliminatedBanner';

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
    // Eliminated players stay in the field for the Rogue Agent prize: we note
    // the flag (for status + copy) but keep routing them into rounds normally.
    setEliminated(!!me?.is_eliminated);

    const { data: allRounds } = await supabase
      .from('quizzes')
      .select('*')
      .order('round_number');
    const rounds = allRounds ?? [];
    // Special briefings live at sentinel round numbers: 0 = pre-game operation
    // briefing, 99 = endgame final briefing/verdict, 100 = endgame reveal.
    // Everything in between is a normal round.
    const openIntro = rounds.find((q) => q.round_number === 0 && q.mission_status === 'open');
    const openVerdict = rounds.find((q) => q.round_number === 99 && q.mission_status === 'open');
    const openReveal = rounds.find((q) => q.round_number === 100 && q.mission_status === 'open');
    const openMission = rounds.find(
      (q) => q.round_number > 0 && q.round_number < 99 && q.mission_status === 'open'
    );
    const openQuiz = rounds.find((q) => q.status === 'open');
    const { data: isMole } = await supabase.rpc('mole_check', { p_player: session.id });

    // Pre-game briefing: rules + strategy for everyone.
    if (openIntro) {
      navigate(`/play/intro/${openIntro.id}`, { replace: true });
      return;
    }

    // Endgame final briefing: the verdict / vote instructions for everyone.
    if (openVerdict) {
      navigate(`/play/final/${openVerdict.id}`, { replace: true });
      return;
    }

    // Endgame reveal: who the mole was, shown to everyone (mole included).
    if (openReveal) {
      navigate(`/play/reveal/${openReveal.id}`, { replace: true });
      return;
    }

    // Mission phase: EVERYONE (including the mole) sees the same public briefing,
    // so a glance at another screen never gives the mole away.
    if (openMission) {
      navigate(`/play/mission/${openMission.id}`, { replace: true });
      return;
    }

    // Quiz phase: players take the quiz in private; the mole instead privately
    // reads their objectives for the NEXT mission.
    if (openQuiz) {
      if (isMole) {
        navigate(`/play/mole/${openQuiz.id}`, { replace: true });
        return;
      }
      const [{ count: qCount }, { count: rCount }] = await Promise.all([
        supabase
          .from('public_questions')
          .select('id', { count: 'exact', head: true })
          .eq('quiz_id', openQuiz.id),
        supabase
          .from('responses')
          .select('id', { count: 'exact', head: true })
          .eq('quiz_id', openQuiz.id)
          .eq('player_id', session.id),
      ]);
      if ((qCount ?? 0) > 0 && (rCount ?? 0) >= (qCount ?? 0)) {
        setCompletedRound(openQuiz); // finished — hold until next round
        setChecking(false);
      } else {
        navigate(`/play/quiz/${openQuiz.id}`, { replace: true });
      }
      return;
    }

    // Nothing live.
    setCompletedRound(null);
    setChecking(false);
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
      status={eliminated ? 'ELIMINATED' : 'STANDBY'}
    >
      <div className="header">
        <Wordmark size={52} />
      </div>

      <ConfigBanner />

      {eliminated && <EliminatedBanner />}

      <div className="status-center">
        {checking ? (
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
              {eliminated
                ? 'Keep going for the Rogue Agent prize — the next quiz opens when the host initiates it'
                : 'The next quiz opens when the host initiates it'}
            </p>
          </>
        )}
      </div>
    </TerminalChrome>
  );
}
