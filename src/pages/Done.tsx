import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';

/**
 * Confirmation after a player finishes a round. Watches for the next round to
 * open (or their own elimination) and routes them onward automatically.
 */
export default function Done() {
  const navigate = useNavigate();
  const session = getSession();

  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('done-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes' },
        () => navigate('/play/wait', { replace: true })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${session.id}` },
        () => navigate('/play/wait', { replace: true })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session && isSupabaseConfigured) return null;

  return (
    <TerminalChrome agentName={session?.name} avatarUrl={session?.avatar} status="TRANSMITTED">
      <Wordmark size={52} />
      <div className="status-center">
        <p className="mono-label">// RESPONSES ENCRYPTED &amp; SENT</p>
        <h2 className="status-headline">TRANSMISSION COMPLETE</h2>
        <p className="status-sub cursor">
          Hold position, {session?.name?.split(' ')[0] ?? 'Agent'}.
          <br />
          The next directive will reach you shortly
        </p>
      </div>
    </TerminalChrome>
  );
}
