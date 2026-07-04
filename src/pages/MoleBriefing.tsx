import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

/**
 * The mole's private screen, shown while a quiz is open (everyone else is off
 * taking the quiz). It reveals the mole's objectives for the NEXT mission, so
 * they can prepare to sabotage the upcoming challenge. During the public
 * mission briefing the mole sees the normal briefing like everyone else, so
 * nothing gives them away.
 *
 * The :quizId param is the CURRENTLY OPEN quiz (the trigger); the briefing shown
 * is for the following round's mission.
 */
export default function MoleBriefing() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [nextTitle, setNextTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [noNext, setNoNext] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured || !quizId) return;

    (async () => {
      const { data: amMole } = await supabase.rpc('mole_check', { p_player: session.id });
      if (!amMole) {
        navigate('/play/wait', { replace: true });
        return;
      }
      // The quiz that put us here must still be open.
      const { data: cur } = await supabase
        .from('quizzes')
        .select('round_number,status')
        .eq('id', quizId)
        .maybeSingle();
      if (!cur || cur.status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      // Objectives for the NEXT round's mission.
      const { data: next } = await supabase
        .from('quizzes')
        .select('id,title')
        .eq('round_number', cur.round_number + 1)
        .maybeSingle();
      if (!next) {
        setNoNext(true);
        setLoading(false);
        return;
      }
      const { data: brief } = await supabase.rpc('mole_briefing', {
        p_player: session.id,
        p_quiz: next.id,
      });
      const parsed = parseMoleBrief(String(brief ?? ''));
      setNextTitle(next.title);
      setDescription(parsed.description);
      setTasks(parsed.objectives);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // When the triggering quiz closes, return the mole to standby.
  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`mole-${quizId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `id=eq.${quizId}` },
        (payload) => {
          if ((payload.new as { status: string }).status !== 'open')
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
    <TerminalChrome
      agentName={session?.name}
      avatarUrl={session?.avatar}
      status="COMPROMISED"
      signal="DARK"
    >
      <Wordmark size={48} />
      <div className="mole-screen">
        <p className="mono-label mole-flag">// CLASSIFIED — EYES ONLY</p>
        <h2 className="status-headline mole-title">YOU ARE THE MOLE</h2>

        {loading ? (
          <p className="status-sub cursor">DECRYPTING NEXT DIRECTIVE</p>
        ) : noNext ? (
          <p className="status-sub">
            This is the final round — no further missions. Play your last hand and stay
            hidden.
          </p>
        ) : (
          <>
            <p className="mono-label">// NEXT MISSION{nextTitle ? ` — ${nextTitle}` : ''}</p>
            <p className="mole-desc">
              {description ||
                'Prepare to sabotage the next challenge without being caught.'}
            </p>
            {tasks.length > 0 ? (
              <ul className="mole-tasks">
                {tasks.map((t, i) => (
                  <li key={i}>
                    <span className="mole-task-marker">▸</span>
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="status-sub">
                No objectives set for the next mission yet. Improvise — blend in and mislead.
              </p>
            )}
          </>
        )}

        <p className="mono-dim mole-foot">Memorize this before the next briefing.</p>
      </div>
    </TerminalChrome>
  );
}
