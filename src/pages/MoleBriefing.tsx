import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

/**
 * The mole's round screen. Instead of taking the quiz, the mole receives a
 * classified list of sabotage directives for the active round. The briefing is
 * fetched via a SECURITY DEFINER function that only returns it to the actual
 * mole — a non-mole gets null and is bounced back to the wait room.
 */
export default function MoleBriefing() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [roundTitle, setRoundTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured || !quizId) return;

    (async () => {
      const { data: brief } = await supabase.rpc('mole_briefing', {
        p_player: session.id,
        p_quiz: quizId,
      });
      // null => caller isn't the mole (or round closed). Don't reveal anything.
      if (brief == null) {
        navigate('/play/wait', { replace: true });
        return;
      }
      const { data: q } = await supabase
        .from('quizzes')
        .select('title,mission_status')
        .eq('id', quizId)
        .maybeSingle();
      if (!q || q.mission_status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      setRoundTitle(q.title);
      const parsed = parseMoleBrief(String(brief));
      setDescription(parsed.description);
      setTasks(parsed.objectives);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // When the host closes the round, return the mole to standby.
  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`mole-${quizId}`)
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

        {roundTitle && <p className="mono-label">// {roundTitle}</p>}
        <p className="mole-desc">
          {description ||
            'Sabotage quietly. You always advance and cannot be eliminated.'}
        </p>

        {loading ? (
          <p className="status-sub cursor">DECRYPTING DIRECTIVES</p>
        ) : tasks.length > 0 ? (
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
            No specific objectives this round. Improvise — blend in and mislead.
          </p>
        )}

        <p className="mono-dim mole-foot">Do not let them catch you.</p>
      </div>
    </TerminalChrome>
  );
}
