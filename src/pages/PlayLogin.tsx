import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { saveSession, codenameFor } from '../lib/session';
import type { Player } from '../lib/types';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import ConfigBanner from '../components/ConfigBanner';

export default function PlayLogin() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [authing, setAuthing] = useState<string | null>(null); // codename flashing in

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setPlayers(data ?? []);
        setLoading(false);
      });
  }, []);

  async function login(p: Player) {
    if (p.is_eliminated) return;
    setAuthing(codenameFor(p.name, p.codename));
    saveSession(p);
    // Stamp first join time (best-effort).
    if (!p.joined_at) {
      await supabase
        .from('players')
        .update({ joined_at: new Date().toISOString() })
        .eq('id', p.id);
    }
    // Brief "ACCESS GRANTED" beat, then into the field.
    setTimeout(() => navigate('/play/wait'), 900);
  }

  if (authing) {
    return (
      <TerminalChrome status="AUTHENTICATING">
        <div className="status-center">
          <p className="mono-label">// IDENTITY CONFIRMED</p>
          <h2 className="status-headline">ACCESS GRANTED</h2>
          <p className="status-sub cursor">{authing}</p>
        </div>
      </TerminalChrome>
    );
  }

  return (
    <TerminalChrome>
      <div className="header">
        <Wordmark size={56} />
        <p className="roster-intro">Select your identity to begin</p>
      </div>

      <ConfigBanner />

      {loading && <p className="status-sub cursor">ACCESSING PERSONNEL FILES</p>}

      {!loading && players.length === 0 && isSupabaseConfigured && (
        <div className="banner">
          <strong>// NO AGENTS ON FILE.</strong> Load your roster by running{' '}
          <code>supabase/seed.sql</code> (or add players from the host tools).
        </div>
      )}

      <div className="roster-grid">
        {players.map((p) => {
          const code = codenameFor(p.name, p.codename);
          return (
            <button
              key={p.id}
              className="roster-card"
              disabled={p.is_eliminated}
              onClick={() => login(p)}
            >
              <div className="roster-avatar">
                {p.avatar_url ? (
                  <img className="avatar-img" src={p.avatar_url} alt="" />
                ) : (
                  p.name[0]?.toUpperCase() ?? '?'
                )}
              </div>
              <div>
                <div className="roster-name">{p.name}</div>
                <div className="roster-codename">
                  {p.is_eliminated ? 'ELIMINATED' : code}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </TerminalChrome>
  );
}
