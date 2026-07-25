import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

/**
 * The pre-game OPERATION BRIEFING — the rules of the game plus strategy tips,
 * shown to every player while the host has the pre-game briefing (round 0) open.
 * When the host closes it, realtime bounces players back to standby.
 *
 * For the mole only, a private, tap-to-reveal section is appended with their
 * ROUND 1 orders. (The per-round mole screen briefs one round ahead during each
 * quiz, so without this the mole would go into the very first mission blind.)
 */
export default function IntroBriefing() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [description, setDescription] = useState('');
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Mole-only round 1 orders.
  const [isMole, setIsMole] = useState(false);
  const [moleDesc, setMoleDesc] = useState('');
  const [moleTasks, setMoleTasks] = useState<string[]>([]);
  const [moleRevealed, setMoleRevealed] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured || !quizId) return;

    (async () => {
      const { data: q } = await supabase
        .from('quizzes')
        .select('mission_status,mission_briefing')
        .eq('id', quizId)
        .maybeSingle();
      if (!q || q.mission_status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      const parsed = parseMoleBrief(q.mission_briefing);
      setDescription(parsed.description);
      setTips(parsed.objectives);
      setLoading(false);

      // If this player is the mole, load their first-mission orders privately.
      // Authored in the pre-game briefing's own Mole orders box.
      const { data: amMole } = await supabase.rpc('mole_check', { p_player: session.id });
      if (!amMole) return;
      setIsMole(true);
      const { data: brief } = await supabase.rpc('mole_briefing', {
        p_player: session.id,
        p_quiz: quizId,
      });
      const mole = parseMoleBrief(String(brief ?? ''));
      setMoleDesc(mole.description);
      setMoleTasks(mole.objectives);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`intro-${quizId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `id=eq.${quizId}` },
        (payload) => {
          if ((payload.new as { mission_status: string }).mission_status !== 'open')
            navigate('/play/wait', { replace: true });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  if (!session && isSupabaseConfigured) return null;

  return (
    <TerminalChrome agentName={session?.name} avatarUrl={session?.avatar} status="BRIEFING">
      <Wordmark size={48} />
      <div className="mole-screen">
        <p className="mono-label">// OPERATION BRIEFING</p>
        <h2 className="status-headline mission-title">HOW THE GAME WORKS</h2>
        <p className="mole-desc">
          {description || 'Await further instructions from your handler.'}
        </p>

        {loading ? (
          <p className="status-sub cursor">RECEIVING TRANSMISSION</p>
        ) : (
          tips.length > 0 && (
            <>
              <h3 className="mission-title brief-subhead">FIELD STRATEGY</h3>
              <ul className="mole-tasks">
                {tips.map((t, i) => (
                  <li key={i}>
                    <span className="mole-task-marker">▸</span>
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )
        )}

        {/* Mole-only: private round 1 orders, hidden until tapped. */}
        {isMole && (
          <div className="mole-section">
            {!moleRevealed ? (
              <button className="mole-gate" onClick={() => setMoleRevealed(true)}>
                <span className="mole-gate-flag">// CLASSIFIED — MOLE EYES ONLY</span>
                <span className="mole-gate-hint">Make sure no one is watching · tap to reveal</span>
              </button>
            ) : (
              <>
                <p className="mono-label mole-flag">// CLASSIFIED — EYES ONLY</p>
                <h3 className="brief-subhead mole-title">YOUR ROUND 1 ORDERS</h3>
                <p className="mole-desc">
                  {moleDesc || 'Sabotage the first challenge without being caught.'}
                </p>
                {moleTasks.length > 0 ? (
                  <ul className="mole-tasks">
                    {moleTasks.map((t, i) => (
                      <li key={i}>
                        <span className="mole-task-marker">▸</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="status-sub">
                    No orders set for round 1 yet. Improvise — blend in and mislead.
                  </p>
                )}
                <p className="mono-dim mole-foot">Memorize this, then close it before the mission.</p>
              </>
            )}
          </div>
        )}

        <p className="mono-dim mole-foot">Trust no one. Good luck, agent.</p>
      </div>
    </TerminalChrome>
  );
}
