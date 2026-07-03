import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { LeaderboardRow, Quiz, QuizStatus } from '../lib/types';
import ConfigBanner from '../components/ConfigBanner';

const PASSCODE = (import.meta.env.VITE_HOST_PASSCODE as string) || 'mole-master';
const GATE_KEY = 'the-mole:host-unlocked';

type View = number | 'all';

interface Standing {
  player_id: string;
  name: string;
  codename: string | null;
  is_eliminated: boolean;
  answered: number;
  correct: number;
  score: number;
}

export default function Host() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(GATE_KEY) === '1'
  );

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return <Dashboard />;
}

/* -------------------------------------------------------------------------- */
function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === PASSCODE) {
      sessionStorage.setItem(GATE_KEY, '1');
      onUnlock();
    } else {
      setErr(true);
    }
  }

  return (
    <div className="screen">
      <div className="screen-content">
        <p className="mono-label">// RESTRICTED — HANDLER ACCESS ONLY</p>
        <form className="gate" onSubmit={submit}>
          <input
            type="password"
            placeholder="ENTER PASSCODE"
            value={value}
            autoFocus
            onChange={(e) => {
              setValue(e.target.value);
              setErr(false);
            }}
          />
          <button className="cta" type="submit">
            Authenticate
          </button>
          {err && <p className="err">ACCESS DENIED</p>}
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function Dashboard() {
  const [rounds, setRounds] = useState<Quiz[]>([]);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [view, setView] = useState<View>('all');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: qs }, { data: lb }] = await Promise.all([
      supabase.from('quizzes').select('*').order('round_number'),
      supabase.from('leaderboard').select('*'),
    ]);
    setRounds(qs ?? []);
    setRows((lb as LeaderboardRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    refresh();
    const channel = supabase
      .channel('host')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function setRoundStatus(round: Quiz, status: QuizStatus) {
    setBusy(true);
    // Only one round should be live at a time — close any other open round.
    if (status === 'open') {
      const others = rounds.filter((r) => r.id !== round.id && r.status === 'open');
      await Promise.all(
        others.map((o) => supabase.from('quizzes').update({ status: 'closed' }).eq('id', o.id))
      );
    }
    await supabase.from('quizzes').update({ status }).eq('id', round.id);
    await refresh();
    setBusy(false);
  }

  async function eliminate(playerId: string, name: string) {
    if (!confirm(`Eliminate ${name} from the game?`)) return;
    setBusy(true);
    await supabase.from('players').update({ is_eliminated: true }).eq('id', playerId);
    await refresh();
    setBusy(false);
  }

  async function revive(playerId: string) {
    setBusy(true);
    await supabase.from('players').update({ is_eliminated: false }).eq('id', playerId);
    await refresh();
    setBusy(false);
  }

  // Build standings for the selected view, sorted worst → best.
  const standings = useMemo<Standing[]>(() => {
    const byPlayer = new Map<string, Standing>();
    for (const r of rows) {
      if (view !== 'all' && r.round_number !== view) continue;
      const cur =
        byPlayer.get(r.player_id) ??
        {
          player_id: r.player_id,
          name: r.name,
          codename: r.codename,
          is_eliminated: r.is_eliminated,
          answered: 0,
          correct: 0,
          score: 0,
        };
      cur.answered += r.answered_count;
      cur.correct += r.correct_count;
      cur.score += r.score;
      byPlayer.set(r.player_id, cur);
    }
    return [...byPlayer.values()].sort(
      (a, b) => a.score - b.score || a.correct - b.correct || a.name.localeCompare(b.name)
    );
  }, [rows, view]);

  // Lowest score among still-active agents who have actually answered — the
  // elimination candidate(s).
  const worstScore = useMemo(() => {
    const live = standings.filter((s) => !s.is_eliminated && s.answered > 0);
    return live.length ? live[0].score : null;
  }, [standings]);

  return (
    <div className="host">
      <div className="host-head">
        <div className="host-title">THE MOLE // HANDLER</div>
        <div className="host-tag">Elimination Control</div>
      </div>

      <ConfigBanner />

      {/* Round controls */}
      <div>
        <p className="section-label">Rounds</p>
        <div className="rounds">
          {rounds.map((r) => (
            <div key={r.id} className={`round-card${r.status === 'open' ? ' active' : ''}`}>
              <span className="round-num">ROUND {r.round_number}</span>
              <span className="round-title">{r.title}</span>
              <span className={`round-status ${r.status}`}>● {r.status}</span>
              <div className="round-actions">
                {r.status !== 'open' ? (
                  <button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => setRoundStatus(r, 'open')}
                  >
                    Open
                  </button>
                ) : (
                  <button
                    className="btn-sm warn"
                    disabled={busy}
                    onClick={() => setRoundStatus(r, 'closed')}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard / elimination */}
      <div>
        <p className="section-label">
          Standings — worst first {view === 'all' ? '(cumulative)' : `(round ${view})`}
        </p>

        <div className="round-actions" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className="btn-sm"
            style={{ flex: 'unset', opacity: view === 'all' ? 1 : 0.5 }}
            onClick={() => setView('all')}
          >
            Cumulative
          </button>
          {rounds.map((r) => (
            <button
              key={r.id}
              className="btn-sm"
              style={{ flex: 'unset', opacity: view === r.round_number ? 1 : 0.5 }}
              onClick={() => setView(r.round_number)}
            >
              R{r.round_number}
            </button>
          ))}
        </div>

        <div className="table-scroll">
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Answered</th>
                <th>Correct</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const isWorst =
                  !s.is_eliminated && s.answered > 0 && s.score === worstScore;
                return (
                  <tr
                    key={s.player_id}
                    className={`${isWorst ? 'worst' : ''} ${
                      s.is_eliminated ? 'eliminated' : ''
                    }`}
                  >
                    <td>
                      <span className="rank-dot" />
                      {s.name}
                      <div className="mono-dim">{s.codename ?? ''}</div>
                    </td>
                    <td className="mono-dim">{s.answered}</td>
                    <td className="mono-dim">{s.correct}</td>
                    <td className="score-cell">{s.score}</td>
                    <td>
                      {s.is_eliminated ? (
                        <button
                          className="btn-sm"
                          disabled={busy}
                          onClick={() => revive(s.player_id)}
                        >
                          Revive
                        </button>
                      ) : (
                        <button
                          className="btn-sm warn"
                          disabled={busy}
                          onClick={() => eliminate(s.player_id, s.name)}
                        >
                          Eliminate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {standings.length === 0 && (
                <tr>
                  <td colSpan={5} className="mono-dim">
                    No responses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
