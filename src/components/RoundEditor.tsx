import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Question, Quiz } from '../lib/types';
import { parseMoleBrief, serializeMoleBrief } from '../lib/moleBriefing';

/**
 * A question row for the editor. correct_index is present only when the
 * handler-only reader (admin_questions RPC) is installed; otherwise we fall
 * back to the answer-key-free public_questions view.
 */
type Row = Omit<Question, 'correct_index'> & { correct_index?: number };

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const MAX_OPTIONS = 10;
const PASSCODE = (import.meta.env.VITE_HOST_PASSCODE as string) || 'mole-master';

interface Draft {
  id?: string; // present when editing an existing question
  prompt: string;
  type: 'mc' | 'tf';
  options: string[];
  correctIndex: number | null;
  metaId: string;
  metaCoord: string;
}

function blankDraft(): Draft {
  return { prompt: '', type: 'mc', options: ['', ''], correctIndex: null, metaId: '', metaCoord: '' };
}

interface Props {
  round: Quiz;
  onClose: () => void;
}

export default function RoundEditor({ round, onClose }: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const [hasKey, setHasKey] = useState(false); // did the handler reader work?
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [briefDesc, setBriefDesc] = useState('');
  const [briefObjectives, setBriefObjectives] = useState('');
  const [briefingMsg, setBriefingMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Prefer the handler-only reader (shows correct answers). Fall back to the
    // answer-key-free view if the SQL add-on isn't installed / passcode mismatch.
    const { data: full, error } = await supabase.rpc('admin_questions', {
      p_passcode: PASSCODE,
      p_quiz: round.id,
    });
    if (!error && full) {
      setItems(full as Row[]);
      setHasKey(true);
    } else {
      const { data } = await supabase
        .from('public_questions')
        .select('*')
        .eq('quiz_id', round.id)
        .order('order_index');
      setItems((data as Row[]) ?? []);
      setHasKey(false);
    }
    const { data: brief } = await supabase.rpc('admin_get_mole_briefing', {
      p_passcode: PASSCODE,
      p_quiz: round.id,
    });
    const parsed = parseMoleBrief(typeof brief === 'string' ? brief : '');
    setBriefDesc(parsed.description);
    setBriefObjectives(parsed.objectives.join('\n'));
    setLoading(false);
  }, [round.id]);

  async function saveBriefing() {
    setBusy(true);
    setBriefingMsg(null);
    const { error } = await supabase.rpc('admin_set_mole_briefing', {
      p_passcode: PASSCODE,
      p_quiz: round.id,
      p_body: serializeMoleBrief(briefDesc, briefObjectives),
    });
    setBusy(false);
    setBriefingMsg(error ? `❌ ${error.message}` : '✅ Saved');
  }

  useEffect(() => {
    load();
  }, [load]);

  function startAdd() {
    setErr(null);
    setDraft(blankDraft());
  }

  function startEdit(q: Row) {
    setErr(null);
    setDraft({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.type === 'tf' ? ['TRUE', 'FALSE'] : [...q.options],
      // Pre-fill the correct answer when the handler reader gave it to us;
      // otherwise the host re-picks it.
      correctIndex: q.correct_index ?? null,
      metaId: q.meta_id ?? '',
      metaCoord: q.meta_coord ?? '',
    });
  }

  function setType(t: 'mc' | 'tf') {
    setDraft((d) =>
      d
        ? {
            ...d,
            type: t,
            options: t === 'tf' ? ['TRUE', 'FALSE'] : d.options.length >= 2 ? d.options : ['', ''],
            correctIndex: null,
          }
        : d
    );
  }

  const updateOpt = (i: number, v: string) =>
    setDraft((d) => {
      if (!d) return d;
      const options = [...d.options];
      options[i] = v;
      return { ...d, options };
    });

  const addOpt = () =>
    setDraft((d) =>
      d && d.options.length < MAX_OPTIONS ? { ...d, options: [...d.options, ''] } : d
    );

  const removeOpt = (i: number) =>
    setDraft((d) => {
      if (!d) return d;
      const options = d.options.filter((_, x) => x !== i);
      let correctIndex = d.correctIndex;
      if (correctIndex === i) correctIndex = null;
      else if (correctIndex != null && correctIndex > i) correctIndex -= 1;
      return { ...d, options, correctIndex };
    });

  async function save() {
    if (!draft) return;
    const prompt = draft.prompt.trim();
    const options = draft.type === 'tf' ? ['TRUE', 'FALSE'] : draft.options.map((o) => o.trim());

    if (!prompt) return setErr('Enter a question prompt.');
    if (draft.type === 'mc') {
      if (options.length < 2) return setErr('Add at least two options.');
      if (options.some((o) => !o)) return setErr('Every option needs text.');
    }
    if (draft.correctIndex == null || draft.correctIndex < 0 || draft.correctIndex >= options.length)
      return setErr('Click a letter to mark the correct answer.');

    setBusy(true);
    setErr(null);
    const row = {
      quiz_id: round.id,
      prompt,
      type: draft.type,
      options,
      correct_index: draft.correctIndex,
      points: 1,
      meta_id: draft.metaId.trim() || null,
      meta_coord: draft.metaCoord.trim() || null,
    };

    const { error } = draft.id
      ? await supabase.from('questions').update(row).eq('id', draft.id)
      : await supabase.from('questions').insert({ ...row, order_index: items.length });

    setBusy(false);
    if (error) return setErr(error.message);
    setDraft(null);
    await load();
  }

  async function remove(q: Row) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from('questions').delete().eq('id', q.id);
    setBusy(false);
    setConfirmDeleteId(null);
    if (error) {
      setErr(`Could not delete: ${error.message}`);
      return;
    }
    if (draft?.id === q.id) setDraft(null);
    await load();
  }

  return (
    <div className="host">
      <div className="editor-head">
        <button className="back-btn" onClick={onClose}>
          ← Dashboard
        </button>
        <div className="editor-title">
          ROUND {round.round_number} · {round.title}
        </div>
        <span className="host-tag">{items.length} question(s)</span>
      </div>

      {/* Mole orders — shown privately to the mole during THIS round's quiz */}
      <div className="mole-orders" style={{ marginTop: 24 }}>
        <p className="section-label">🕵 Mole orders — only the Mole sees this</p>
        <p className="setup-hint">
          Players never see this. Shown privately to the Mole during THIS round's quiz (while
          everyone else answers) — their prep for the next challenge. Set the scene with a
          description, then list the sabotage objectives; each line becomes its own item on the
          Mole's screen.
        </p>

        <label className="q-label">Description</label>
        <textarea
          className="import-area"
          style={{ minHeight: 80 }}
          spellCheck={false}
          placeholder="This round the team builds the best poker hand by collecting cards. Blend in while you undermine them."
          value={briefDesc}
          onChange={(e) => {
            setBriefDesc(e.target.value);
            setBriefingMsg(null);
          }}
        />

        <label className="q-label">Objectives — one per line</label>
        <textarea
          className="import-area"
          style={{ minHeight: 120 }}
          spellCheck={false}
          placeholder={'Collect the worst cards you can\nSlow the group down by being indecisive\nThrow suspicion on someone who pulls a bad card'}
          value={briefObjectives}
          onChange={(e) => {
            setBriefObjectives(e.target.value);
            setBriefingMsg(null);
          }}
        />

        <div className="round-actions" style={{ marginTop: 8 }}>
          <button
            className="btn-sm"
            style={{ flex: 'unset' }}
            disabled={busy}
            onClick={saveBriefing}
          >
            Save briefing
          </button>
          {briefingMsg && (
            <span className="mono-dim" style={{ alignSelf: 'center' }}>
              {briefingMsg}
            </span>
          )}
        </div>
      </div>

      {!loading && !hasKey && items.length > 0 && (
        <p className="mono-dim">
          Correct answers are hidden. To highlight them here, run{' '}
          <code>supabase/host-tools.sql</code> and set the handler passcode to match your{' '}
          <code>VITE_HOST_PASSCODE</code>.
        </p>
      )}

      {/* Question list */}
      <div>
        {loading ? (
          <p className="mono-dim">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mono-dim">No questions yet. Add the first one below.</p>
        ) : (
          <div className="q-list">
            {items.map((q, i) => (
              <div className="q-item" key={q.id}>
                <div className="q-item-main">
                  <div className="q-item-num">Q{i + 1}</div>
                  <div>
                    <div className="q-item-prompt">{q.prompt}</div>
                    <div className="q-item-opts">
                      {q.options.map((o, oi) => (
                        <span
                          key={oi}
                          className={`q-chip${q.correct_index === oi ? ' correct' : ''}`}
                        >
                          {q.correct_index === oi ? '✓ ' : ''}
                          {LETTERS[oi]}. {o}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="q-item-actions">
                  {confirmDeleteId === q.id ? (
                    <>
                      <button className="btn-sm warn" disabled={busy} onClick={() => remove(q)}>
                        Confirm
                      </button>
                      <button className="btn-sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-sm" disabled={busy} onClick={() => startEdit(q)}>
                        Edit
                      </button>
                      <button
                        className="btn-sm warn"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(q.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!draft && (
          <button className="cta" style={{ marginTop: 20 }} onClick={startAdd}>
            + Add question
          </button>
        )}
      </div>

      {/* Add / edit form */}
      {draft && (
        <div className="q-form">
          <div className="section-label">{draft.id ? 'Edit question' : 'New question'}</div>

          <label className="q-label">Prompt</label>
          <textarea
            className="q-input"
            rows={2}
            placeholder="WHO WAS SEEN EXITING THE COMPOUND?"
            value={draft.prompt}
            onChange={(e) => setDraft((d) => d && { ...d, prompt: e.target.value })}
          />

          <label className="q-label">Type</label>
          <div className="q-type-toggle">
            <button
              className={`btn-sm${draft.type === 'mc' ? ' on' : ''}`}
              style={{ flex: 'unset' }}
              onClick={() => setType('mc')}
            >
              Multiple choice
            </button>
            <button
              className={`btn-sm${draft.type === 'tf' ? ' on' : ''}`}
              style={{ flex: 'unset' }}
              onClick={() => setType('tf')}
            >
              True / False
            </button>
          </div>

          <label className="q-label">
            Options — <span className="mono-dim">click the letter to mark the correct answer</span>
          </label>
          <div className="q-opts">
            {draft.options.map((opt, i) => (
              <div className="opt-row" key={i}>
                <button
                  type="button"
                  className={`opt-correct${draft.correctIndex === i ? ' on' : ''}`}
                  title="Mark correct"
                  onClick={() => setDraft((d) => d && { ...d, correctIndex: i })}
                >
                  {LETTERS[i]}
                </button>
                <input
                  className="q-input"
                  value={opt}
                  disabled={draft.type === 'tf'}
                  placeholder={`Option ${LETTERS[i]}`}
                  onChange={(e) => updateOpt(i, e.target.value)}
                />
                {draft.type === 'mc' && draft.options.length > 2 && (
                  <button className="opt-del" title="Remove option" onClick={() => removeOpt(i)}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {draft.type === 'mc' && draft.options.length < MAX_OPTIONS && (
              <button className="btn-sm" style={{ flex: 'unset' }} onClick={addOpt}>
                + Add option
              </button>
            )}
          </div>

          {draft.id && draft.correctIndex == null && (
            <p className="mono-dim" style={{ marginTop: 4 }}>
              Saved answer is hidden — re-select the correct option before saving.
            </p>
          )}

          <details className="q-meta">
            <summary>Optional flavor line (ID / coordinates)</summary>
            <div className="q-meta-grid">
              <input
                className="q-input"
                placeholder="ID e.g. MOLE-1-032"
                value={draft.metaId}
                onChange={(e) => setDraft((d) => d && { ...d, metaId: e.target.value })}
              />
              <input
                className="q-input"
                placeholder="COORD e.g. 52.37° N, 4.89° E"
                value={draft.metaCoord}
                onChange={(e) => setDraft((d) => d && { ...d, metaCoord: e.target.value })}
              />
            </div>
          </details>

          {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}

          <div className="q-form-actions">
            <button className="cta" disabled={busy} onClick={save}>
              {draft.id ? 'Save changes' : 'Add to round'}
            </button>
            <button className="btn-sm" style={{ flex: 'unset' }} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
