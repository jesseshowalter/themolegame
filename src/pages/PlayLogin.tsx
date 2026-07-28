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
  const [pinFor, setPinFor] = useState<Player | null>(null); // account awaiting a password
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

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

  function onTap(p: Player) {
    if (p.has_password) {
      setPinFor(p);
      setPinValue('');
      setPinError(false);
    } else {
      login(p);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinFor) return;
    setPinBusy(true);
    setPinError(false);
    const { data: ok } = await supabase.rpc('verify_password', {
      p_player: pinFor.id,
      p_password: pinValue,
    });
    setPinBusy(false);
    if (ok) {
      const p = pinFor;
      setPinFor(null);
      login(p);
    } else {
      setPinError(true);
    }
  }

  if (pinFor) {
    return (
      <TerminalChrome status="LOCKED" signal="SECURED">
        <Wordmark size={52} />
        <form className="gate" onSubmit={submitPin}>
          <div className="roster-avatar login-avatar">
            {pinFor.avatar_url ? (
              <img className="avatar-img" src={pinFor.avatar_url} alt="" />
            ) : (
              pinFor.name[0]?.toUpperCase() ?? '?'
            )}
          </div>
          <p className="mono-label">// IDENTITY: {codenameFor(pinFor.name, pinFor.codename)}</p>
          <p className="roster-intro">Enter your password, {pinFor.name.split(' ')[0]}</p>
          <input
            type="password"
            placeholder="PASSWORD"
            value={pinValue}
            autoFocus
            onChange={(e) => {
              setPinValue(e.target.value);
              setPinError(false);
            }}
          />
          <button className="cta" type="submit" disabled={pinBusy}>
            Authenticate
          </button>
          {pinError && <p className="err">ACCESS DENIED</p>}
          <button
            type="button"
            className="btn-sm"
            style={{ flex: 'unset' }}
            onClick={() => setPinFor(null)}
          >
            ← Back to roster
          </button>
        </form>
      </TerminalChrome>
    );
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
              className={`roster-card${p.is_eliminated ? ' eliminated' : ''}`}
              onClick={() => onTap(p)}
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
                  {code}
                  {p.is_eliminated && <span className="tag-elim"> · ELIMINATED</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </TerminalChrome>
  );
}
