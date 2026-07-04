import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession, codenameFor } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

type Mole = { name: string; codename: string | null; avatar_url: string | null };

/**
 * The ENDGAME reveal — shown to every player (the mole included) while the host
 * has the endgame briefing (round 99) open. Unmasks the mole via the
 * reveal_mole() RPC (which only returns while the endgame is live) and shows the
 * host's closing / thank-you message. Realtime bounces players to standby when
 * the host closes it.
 */
export default function Reveal() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [mole, setMole] = useState<Mole | null>(null);
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
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
      setMessage(parsed.description);
      setNotes(parsed.objectives);

      const { data: reveal } = await supabase.rpc('reveal_mole');
      const row = (reveal as Mole[] | null)?.[0] ?? null;
      setMole(row);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`reveal-${quizId}`)
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
    <TerminalChrome agentName={session?.name} avatarUrl={session?.avatar} status="DECLASSIFIED">
      <Wordmark size={48} />
      <div className="mole-screen reveal-screen">
        <p className="mono-label">// MISSION DEBRIEF</p>

        {loading ? (
          <p className="status-sub cursor">DECLASSIFYING</p>
        ) : mole ? (
          <>
            <p className="reveal-lead">THE MOLE WAS</p>
            <div className="reveal-mole">
              <div className="reveal-avatar">
                {mole.avatar_url ? (
                  <img className="avatar-img" src={mole.avatar_url} alt="" />
                ) : (
                  mole.name[0]?.toUpperCase() ?? '?'
                )}
              </div>
              <h2 className="reveal-name">{mole.name}</h2>
              <p className="reveal-codename">{codenameFor(mole.name, mole.codename)}</p>
            </div>
          </>
        ) : (
          <h2 className="status-headline mission-title">THE GAME IS OVER</h2>
        )}

        {message && <p className="mole-desc">{message}</p>}

        {notes.length > 0 && (
          <ul className="mole-tasks">
            {notes.map((t, i) => (
              <li key={i}>
                <span className="mole-task-marker">▸</span>
                {t}
              </li>
            ))}
          </ul>
        )}

        <p className="mono-dim mole-foot">Thank you for playing. // END TRANSMISSION</p>
      </div>
    </TerminalChrome>
  );
}
