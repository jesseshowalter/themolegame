import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

/**
 * The endgame FINAL BRIEFING (round 99) — the verdict instructions shown to
 * everyone before the reveal (e.g. "write who you think the Mole is on your
 * whiteboard, reveal on the host's word"). When the host closes it (or launches
 * the reveal), realtime bounces players back to standby.
 */
export default function FinalBriefing() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
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
        .select('title,mission_status,mission_briefing')
        .eq('id', quizId)
        .maybeSingle();
      if (!q || q.mission_status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      const parsed = parseMoleBrief(q.mission_briefing);
      setTitle(parsed.title || 'THE VERDICT');
      setDescription(parsed.description);
      setSteps(parsed.objectives);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`final-${quizId}`)
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
        <p className="mono-label">// FINAL BRIEFING</p>
        <h2 className="status-headline mission-title">{title}</h2>
        <p className="mole-desc">
          {description || 'Await the host’s final instructions.'}
        </p>

        {loading ? (
          <p className="status-sub cursor">RECEIVING TRANSMISSION</p>
        ) : (
          steps.length > 0 && (
            <ul className="mole-tasks">
              {steps.map((t, i) => (
                <li key={i}>
                  <span className="mole-task-marker">▸</span>
                  {t}
                </li>
              ))}
            </ul>
          )
        )}

        <p className="mono-dim mole-foot">Hold for the host’s signal.</p>
      </div>
    </TerminalChrome>
  );
}
