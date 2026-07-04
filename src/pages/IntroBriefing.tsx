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
 */
export default function IntroBriefing() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [description, setDescription] = useState('');
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
            <ul className="mole-tasks">
              {tips.map((t, i) => (
                <li key={i}>
                  <span className="mole-task-marker">▸</span>
                  {t}
                </li>
              ))}
            </ul>
          )
        )}

        <p className="mono-dim mole-foot">Trust no one. Good luck, agent.</p>
      </div>
    </TerminalChrome>
  );
}
