import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/types';
import { codenameFor } from '../lib/session';

interface Props {
  players: Player[];
  onChanged: () => void | Promise<void>;
}

/** Roster management: add, rename, eliminate/revive, remove agents. */
export default function PlayersPanel({ players, onChanged }: Props) {
  const [name, setName] = useState('');
  const [codename, setCodename] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('players')
      .insert({ name: n, codename: codename.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    setName('');
    setCodename('');
    await onChanged();
  }

  function startEdit(p: Player) {
    setEditId(p.id);
    setEditName(p.name);
    setEditCode(p.codename ?? '');
    setErr(null);
  }

  async function saveEdit() {
    if (!editId) return;
    const n = editName.trim();
    if (!n) return setErr('Name is required.');
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('players')
      .update({ name: n, codename: editCode.trim() || null })
      .eq('id', editId);
    setBusy(false);
    if (error) return setErr(error.message);
    setEditId(null);
    await onChanged();
  }

  async function toggleEliminated(p: Player) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('players')
      .update({ is_eliminated: !p.is_eliminated })
      .eq('id', p.id);
    setBusy(false);
    if (error) return setErr(error.message);
    await onChanged();
  }

  async function removePlayer(p: Player) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from('players').delete().eq('id', p.id);
    setBusy(false);
    setConfirmDeleteId(null);
    if (error) {
      setErr(`Could not remove — run the latest host-tools.sql to enable player removal. (${error.message})`);
      return;
    }
    await onChanged();
  }

  return (
    <div>
      <p className="section-label">Roster — {players.length} agent(s)</p>

      <form className="player-add" onSubmit={addPlayer}>
        <input
          className="q-input"
          placeholder="Agent name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="q-input"
          placeholder="Codename (optional)"
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
        />
        <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy || !name.trim()}>
          + Add agent
        </button>
      </form>
      {err && (
        <p className="err" style={{ marginTop: 8 }}>
          {err}
        </p>
      )}

      <div className="player-list">
        {players.map((p) =>
          editId === p.id ? (
            <div key={p.id} className="player-row">
              <div className="player-edit">
                <input
                  className="q-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Agent name"
                />
                <input
                  className="q-input"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder="Codename"
                />
                <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy} onClick={saveEdit}>
                  Save
                </button>
                <button className="btn-sm" style={{ flex: 'unset' }} onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={p.id} className={`player-row${p.is_eliminated ? ' eliminated' : ''}`}>
              <div className="player-id">
                <div className="roster-avatar" style={{ width: 36, height: 36, fontSize: 15 }}>
                  {p.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <div className="player-name">
                    {p.name}
                    {p.is_eliminated && <span className="tag-elim"> · ELIMINATED</span>}
                  </div>
                  <div className="mono-dim">{codenameFor(p.name, p.codename)}</div>
                </div>
              </div>
              <div className="player-actions">
                <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy} onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button
                  className={`btn-sm${p.is_eliminated ? '' : ' warn'}`}
                  style={{ flex: 'unset' }}
                  disabled={busy}
                  onClick={() => toggleEliminated(p)}
                >
                  {p.is_eliminated ? 'Revive' : 'Eliminate'}
                </button>
                {confirmDeleteId === p.id ? (
                  <span className="confirm-inline">
                    <button
                      className="btn-sm warn"
                      style={{ flex: 'unset' }}
                      disabled={busy}
                      onClick={() => removePlayer(p)}
                    >
                      Confirm
                    </button>
                    <button className="btn-sm" style={{ flex: 'unset' }} onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn-sm warn"
                    style={{ flex: 'unset' }}
                    disabled={busy}
                    onClick={() => setConfirmDeleteId(p.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        )}
        {players.length === 0 && <p className="mono-dim">No agents yet. Add your guests above.</p>}
      </div>
    </div>
  );
}
