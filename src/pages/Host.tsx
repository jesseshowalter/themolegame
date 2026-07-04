import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { LeaderboardRow, Player, Quiz, QuizStatus } from '../lib/types';
import ConfigBanner from '../components/ConfigBanner';
import RoundEditor from '../components/RoundEditor';
import MissionEditor from '../components/MissionEditor';
import PlayersPanel from '../components/PlayersPanel';
import {
  parseQuestionImport,
  IMPORT_TEMPLATE,
  type ParsedRound,
} from '../lib/importQuestions';

const PASSCODE = (import.meta.env.VITE_HOST_PASSCODE as string) || 'mole-master';
const GATE_KEY = 'the-mole:host-unlocked';

// Consistent phase-state labels: locked (gray) / active (green) / closed (red).
// The raw status doubles as the CSS class for color; only the text changes.
function phaseLabel(status: string): string {
  return status === 'open' ? 'active' : status;
}

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
  const [players, setPlayers] = useState<Player[]>([]);
  const [moleId, setMoleId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<'rounds' | 'standings' | 'players' | 'advanced'>('rounds');
  const [view, setView] = useState<View>('all');
  const [busy, setBusy] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [confirmEliminateId, setConfirmEliminateId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sort, setSort] = useState<{
    key: 'agent' | 'correct' | 'incorrect' | 'score';
    dir: 'asc' | 'desc';
  }>({ key: 'score', dir: 'asc' }); // default: lowest score first (worst)

  // Question-upload panel state.
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ data: qs }, { data: lb }, { data: pq }, { data: pl }, mole] = await Promise.all([
      supabase.from('quizzes').select('*').order('round_number'),
      supabase.from('leaderboard').select('*'),
      supabase.from('public_questions').select('quiz_id'),
      supabase.from('players').select('*').order('name'),
      supabase.rpc('admin_get_mole', { p_passcode: PASSCODE }),
    ]);
    setRounds(qs ?? []);
    setRows((lb as LeaderboardRow[]) ?? []);
    setPlayers((pl as Player[]) ?? []);
    setMoleId((mole.error ? null : (mole.data as string | null)) ?? null);
    const c: Record<string, number> = {};
    (pq ?? []).forEach((row) => {
      c[row.quiz_id] = (c[row.quiz_id] ?? 0) + 1;
    });
    setCounts(c);
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

  // Close every open mission and quiz across all rounds — only one phase is
  // ever live at a time (a mission or a quiz).
  async function closeAllLive() {
    await Promise.all(
      rounds.flatMap((r) => {
        const ops = [];
        if (r.status === 'open')
          ops.push(supabase.from('quizzes').update({ status: 'closed' }).eq('id', r.id));
        if (r.mission_status === 'open')
          ops.push(
            supabase.from('quizzes').update({ mission_status: 'closed' }).eq('id', r.id)
          );
        return ops;
      })
    );
  }

  async function setRoundStatus(round: Quiz, status: QuizStatus) {
    setBusy(true);
    if (status === 'open') await closeAllLive();
    await supabase.from('quizzes').update({ status }).eq('id', round.id);
    await refresh();
    setBusy(false);
  }

  async function setMissionStatus(round: Quiz, status: QuizStatus) {
    setBusy(true);
    if (status === 'open') await closeAllLive();
    await supabase.from('quizzes').update({ mission_status: status }).eq('id', round.id);
    await refresh();
    setBusy(false);
  }

  async function eliminate(playerId: string) {
    setBusy(true);
    await supabase.from('players').update({ is_eliminated: true }).eq('id', playerId);
    setConfirmEliminateId(null);
    await refresh();
    setBusy(false);
  }

  async function revive(playerId: string) {
    setBusy(true);
    await supabase.from('players').update({ is_eliminated: false }).eq('id', playerId);
    await refresh();
    setBusy(false);
  }

  // Designate (or clear) the mole. Pass null to unset.
  async function setMole(playerId: string | null) {
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_mole', {
      p_passcode: PASSCODE,
      p_player: playerId,
    });
    if (!error) setMoleId(playerId);
    await refresh();
    setBusy(false);
  }

  // Live-validate the pasted JSON so we can preview and gate the Import button.
  const parsed = useMemo(
    () => (importText.trim() ? parseQuestionImport(importText) : null),
    [importText]
  );
  const canImport = !!parsed && parsed.errors.length === 0 && parsed.rounds.length > 0;

  // Upsert each round and replace its questions. Rounds not present in the JSON
  // are left untouched (so you can upload one round at a time if you like).
  async function importContent(importRounds: ParsedRound[]) {
    setBusy(true);
    setImportMsg('Uploading…');
    try {
      for (const r of importRounds) {
        const { data: quiz, error: qErr } = await supabase
          .from('quizzes')
          .upsert(
            { round_number: r.round_number, title: r.title, subtitle: r.subtitle },
            { onConflict: 'round_number' }
          )
          .select('id')
          .single();
        if (qErr || !quiz) {
          throw new Error(qErr?.message ?? `Round ${r.round_number}: could not save round.`);
        }
        const { error: delErr } = await supabase
          .from('questions')
          .delete()
          .eq('quiz_id', quiz.id);
        if (delErr) throw new Error(`Round ${r.round_number}: ${delErr.message}`);

        const payload = r.questions.map((q, i) => ({
          quiz_id: quiz.id,
          order_index: i,
          prompt: q.prompt,
          type: q.type,
          options: q.options,
          correct_index: q.correct_index,
          points: q.points,
          meta_id: q.meta_id,
          meta_coord: q.meta_coord,
        }));
        const { error: insErr } = await supabase.from('questions').insert(payload);
        if (insErr) throw new Error(`Round ${r.round_number}: ${insErr.message}`);
      }
      const totalQ = importRounds.reduce((n, r) => n + r.questions.length, 0);
      setImportMsg(`✅ Uploaded ${importRounds.length} round(s) · ${totalQ} question(s).`);
      setImportText('');
      await refresh();
    } catch (e) {
      setImportMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // Wipe game STATE (answers, eliminations, round status). Keeps roster + questions.
  async function resetGame() {
    setBusy(true);
    setImportMsg(null);
    const IMPOSSIBLE = '00000000-0000-0000-0000-000000000000';
    try {
      await supabase.from('responses').delete().neq('id', IMPOSSIBLE);
      await supabase.from('players').update({ is_eliminated: false }).neq('id', IMPOSSIBLE);
      await supabase.from('quizzes').update({ status: 'locked' }).neq('id', IMPOSSIBLE);
      setView('all');
      await refresh();
    } finally {
      setConfirmReset(false);
      setBusy(false);
    }
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
    const metric = (s: Standing) =>
      sort.key === 'correct'
        ? s.correct
        : sort.key === 'incorrect'
          ? s.answered - s.correct
          : s.score; // 'score' (agent is handled by name below)
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...byPlayer.values()].sort((a, b) => {
      let d = sort.key === 'agent' ? a.name.localeCompare(b.name) : metric(a) - metric(b);
      if (d === 0) d = a.name.localeCompare(b.name); // stable tiebreak
      return d * dir;
    });
  }, [rows, view, sort]);

  // Lowest score among still-active agents who have actually answered — the
  // elimination candidate(s).
  const worstScore = useMemo(() => {
    // The mole never takes quizzes and can't be eliminated — exclude them.
    const live = standings.filter(
      (s) => !s.is_eliminated && s.answered > 0 && s.player_id !== moleId
    );
    return live.length ? Math.min(...live.map((s) => s.score)) : null;
  }, [standings, moleId]);

  // Clicking a header sorts by it; clicking again flips direction.
  function toggleSort(key: 'agent' | 'correct' | 'incorrect' | 'score') {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'agent' ? 'asc' : 'desc' } // names A→Z, stats high→low
    );
  }
  const sortArrow = (key: string) =>
    sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  // Full-screen per-round question editor.
  const editingRound = rounds.find((r) => r.id === editingRoundId);
  if (editingRound) {
    return (
      <RoundEditor
        round={editingRound}
        onClose={() => {
          setEditingRoundId(null);
          refresh();
        }}
      />
    );
  }

  // Full-screen mission briefing editor.
  const editingMission = rounds.find((r) => r.id === editingMissionId);
  if (editingMission) {
    return (
      <MissionEditor
        round={editingMission}
        onClose={() => {
          setEditingMissionId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="host">
      <div className="host-head">
        <div className="host-title">THE MOLE // HANDLER</div>
        <div className="host-tag">Elimination Control</div>
      </div>

      <ConfigBanner />

      <div className="tabs" role="tablist">
        <button
          className={`tab${tab === 'rounds' ? ' active' : ''}`}
          onClick={() => setTab('rounds')}
        >
          Rounds
        </button>
        <button
          className={`tab${tab === 'standings' ? ' active' : ''}`}
          onClick={() => setTab('standings')}
        >
          Standings
        </button>
        <button
          className={`tab${tab === 'players' ? ' active' : ''}`}
          onClick={() => setTab('players')}
        >
          Players
        </button>
        <button
          className={`tab${tab === 'advanced' ? ' active' : ''}`}
          onClick={() => setTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {/* Round controls — each round is a Mission card + a Quiz card */}
      {tab === 'rounds' && (
      <div>
        <div className="round-rows">
          {rounds.map((r) => {
            const missionStatus = r.mission_status ?? 'locked';
            return (
              <div className="round-row" key={r.id}>
                <p className="round-row-label">
                  ROUND {r.round_number} · {r.title}
                </p>
                <div className="round-row-cards">
                  {/* MISSION */}
                  <div className={`round-card${missionStatus === 'open' ? ' active' : ''}`}>
                    <div className="round-card-top">
                      <span className="round-num">MISSION</span>
                      <button className="round-edit" onClick={() => setEditingMissionId(r.id)}>
                        BRIEFING ›
                      </button>
                    </div>
                    <span className="round-title">Mission briefing</span>
                    <span className={`round-status ${missionStatus}`}>
                      ● {phaseLabel(missionStatus)}
                    </span>
                    <div className="round-actions">
                      {missionStatus !== 'open' ? (
                        <button
                          className="btn-sm"
                          disabled={busy}
                          onClick={() => setMissionStatus(r, 'open')}
                        >
                          Send Mission Briefing
                        </button>
                      ) : (
                        <button
                          className="btn-sm warn"
                          disabled={busy}
                          onClick={() => setMissionStatus(r, 'closed')}
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>

                  {/* QUIZ */}
                  <div className={`round-card${r.status === 'open' ? ' active' : ''}`}>
                    <div className="round-card-top">
                      <span className="round-num">QUIZ · {counts[r.id] ?? 0}Q</span>
                      <button className="round-edit" onClick={() => setEditingRoundId(r.id)}>
                        QUESTIONS ›
                      </button>
                    </div>
                    <span className="round-title">Quiz</span>
                    <span className={`round-status ${r.status}`}>● {phaseLabel(r.status)}</span>
                    <div className="round-actions">
                      {r.status !== 'open' ? (
                        <button
                          className="btn-sm"
                          disabled={busy}
                          onClick={() => setRoundStatus(r, 'open')}
                        >
                          Unlock the Quiz
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
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Leaderboard / elimination */}
      {tab === 'standings' && (
      <div>
        <p className="section-label">
          Standings — {view === 'all' ? 'cumulative' : `round ${view}`} · tap a header to sort
          {' · '}lowest score flagged
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
                <th
                  className={`sortable${sort.key === 'agent' ? ' active' : ''}`}
                  onClick={() => toggleSort('agent')}
                >
                  Agent{sortArrow('agent')}
                </th>
                <th
                  className={`col-icon sortable${sort.key === 'correct' ? ' active' : ''}`}
                  title="Correct"
                  aria-label="Correct"
                  onClick={() => toggleSort('correct')}
                >
                  ✅{sortArrow('correct')}
                </th>
                <th
                  className={`col-icon sortable${sort.key === 'incorrect' ? ' active' : ''}`}
                  title="Incorrect"
                  aria-label="Incorrect"
                  onClick={() => toggleSort('incorrect')}
                >
                  ❌{sortArrow('incorrect')}
                </th>
                <th
                  className={`col-icon sortable${sort.key === 'score' ? ' active' : ''}`}
                  title="Score"
                  aria-label="Score"
                  onClick={() => toggleSort('score')}
                >
                  🏆{sortArrow('score')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const isMole = s.player_id === moleId;
                const isWorst =
                  !isMole && !s.is_eliminated && s.answered > 0 && s.score === worstScore;
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
                      {isMole && <span className="tag-mole"> · MOLE</span>}
                      <div className="mono-dim">{s.codename ?? ''}</div>
                    </td>
                    <td className="mono-dim col-icon">{s.correct}</td>
                    <td className="mono-dim col-icon">{s.answered - s.correct}</td>
                    <td className="score-cell col-icon">{s.score}</td>
                    <td>
                      {isMole ? (
                        <span className="mono-dim">protected</span>
                      ) : s.is_eliminated ? (
                        <button
                          className="btn-sm"
                          disabled={busy}
                          onClick={() => revive(s.player_id)}
                        >
                          Revive
                        </button>
                      ) : confirmEliminateId === s.player_id ? (
                        <span className="confirm-inline">
                          <button
                            className="btn-sm warn"
                            disabled={busy}
                            onClick={() => eliminate(s.player_id)}
                          >
                            Confirm
                          </button>
                          <button className="btn-sm" onClick={() => setConfirmEliminateId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          className="btn-sm warn"
                          disabled={busy}
                          onClick={() => setConfirmEliminateId(s.player_id)}
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
      )}

      {/* Players / roster */}
      {tab === 'players' && (
        <PlayersPanel
          players={players}
          moleId={moleId}
          onSetMole={setMole}
          onChanged={refresh}
        />
      )}

      {/* Advanced: bulk import + reset */}
      {tab === 'advanced' && (
      <>
      <details className="bulk-import">
        <summary>Bulk import questions (paste JSON)</summary>
        <p className="setup-hint" style={{ marginTop: 12 }}>
          For editing questions one at a time, use the <strong>QUESTIONS</strong> button on a
          round card above. This panel is for pasting a full JSON set at once — it replaces
          each included round's questions and leaves others untouched.
        </p>

        <textarea
          className="import-area"
          spellCheck={false}
          placeholder='{ "rounds": [ { "round": 1, "title": "BRIEFING", "questions": [ … ] } ] }'
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setImportMsg(null);
          }}
        />

        <div className="round-actions" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn-sm"
            style={{ flex: 'unset' }}
            onClick={() => setImportText(IMPORT_TEMPLATE)}
          >
            Load template
          </button>
          <button
            className="btn-sm"
            style={{ flex: 'unset' }}
            disabled={!canImport || busy}
            onClick={() => parsed && importContent(parsed.rounds)}
          >
            Upload{parsed?.rounds.length ? ` ${parsed.rounds.length} round(s)` : ''}
          </button>
        </div>

        {/* Live validation + preview */}
        {parsed && parsed.errors.length > 0 && (
          <div className="import-preview err-list">
            {parsed.errors.slice(0, 10).map((e, i) => (
              <div key={i}>• {e}</div>
            ))}
            {parsed.errors.length > 10 && <div>…and {parsed.errors.length - 10} more</div>}
          </div>
        )}
        {parsed && parsed.errors.length === 0 && parsed.rounds.length > 0 && (
          <div className="import-preview ok-list">
            {parsed.rounds.map((r) => (
              <div key={r.round_number}>
                ✓ Round {r.round_number} — <strong>{r.title}</strong> · {r.questions.length}{' '}
                question(s)
              </div>
            ))}
          </div>
        )}
        {importMsg && <p className="import-msg">{importMsg}</p>}
      </details>

      {/* Danger zone */}
      <div className="danger-zone">
        <p className="section-label" style={{ color: 'var(--danger)' }}>
          Danger zone
        </p>
        <div className="danger-row">
          <div>
            <div className="danger-title">Reset game</div>
            <div className="setup-hint">
              Clears all answers, un-eliminates everyone, and re-locks all rounds. Keeps
              your roster and questions.
            </div>
          </div>
          {confirmReset ? (
            <span className="confirm-inline">
              <button className="cta danger" disabled={busy} onClick={resetGame}>
                Confirm reset
              </button>
              <button className="btn-sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="cta danger" disabled={busy} onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
