import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Question, Quiz } from '../lib/types';

/** Player-safe row (no correct_index — the key stays hidden even from the host). */
type ListItem = Omit<Question, 'correct_index'>;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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
  const [items, setItems] = useState<ListItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('public_questions')
      .select('*')
      .eq('quiz_id', round.id)
      .order('order_index');
    setItems((data as ListItem[]) ?? []);
    setLoading(false);
  }, [round.id]);

  useEffect(() => {
    load();
  }, [load]);

  function startAdd() {
    setErr(null);
    setDraft(blankDraft());
  }

  function startEdit(q: ListItem) {
    setErr(null);
    setDraft({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.type === 'tf' ? ['TRUE', 'FALSE'] : [...q.options],
      correctIndex: null, // hidden for anti-cheat — host re-picks on edit
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
    setDraft((d) => (d && d.options.length < 8 ? { ...d, options: [...d.options, ''] } : d));

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

  async function remove(q: ListItem) {
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
                        <span key={oi} className="q-chip">
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
            {draft.type === 'mc' && draft.options.length < 8 && (
              <button className="btn-sm" style={{ flex: 'unset' }} onClick={addOpt}>
                + Add option
              </button>
            )}
          </div>

          {draft.id && (
            <p className="mono-dim" style={{ marginTop: 4 }}>
              Saved answers are hidden for anti-cheat — re-select the correct option before saving.
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
