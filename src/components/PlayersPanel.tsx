import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/types';
import { codenameFor } from '../lib/session';
import { fileToAvatarDataUrl } from '../lib/avatar';

interface Props {
  players: Player[];
  moleId: string | null;
  onSetMole: (id: string | null) => void | Promise<void>;
  onChanged: () => void | Promise<void>;
}

/** Roster management: add, rename, remove agents, and designate the mole. */
export default function PlayersPanel({ players, moleId, onSetMole, onChanged }: Props) {
  const [name, setName] = useState('');
  const [codename, setCodename] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
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
    setEditAvatar(p.avatar_url);
    setErr(null);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setErr(null);
    try {
      setEditAvatar(await fileToAvatarDataUrl(file));
    } catch {
      setErr('Could not read that image. Try a JPG or PNG.');
    }
  }

  async function saveEdit() {
    if (!editId) return;
    const n = editName.trim();
    if (!n) return setErr('Name is required.');
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('players')
      .update({ name: n, codename: editCode.trim() || null, avatar_url: editAvatar })
      .eq('id', editId);
    setBusy(false);
    if (error) return setErr(error.message);
    setEditId(null);
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
                <div className="avatar-edit">
                  <div className="roster-avatar avatar-lg">
                    {editAvatar ? (
                      <img className="avatar-img" src={editAvatar} alt="" />
                    ) : (
                      editName[0]?.toUpperCase() ?? '?'
                    )}
                  </div>
                  <label className="btn-sm" style={{ flex: 'unset', cursor: 'pointer' }}>
                    {editAvatar ? 'Change photo' : 'Upload photo'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={onPickAvatar}
                    />
                  </label>
                  {editAvatar && (
                    <button
                      className="btn-sm warn"
                      style={{ flex: 'unset' }}
                      onClick={() => setEditAvatar(null)}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
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
                <div className="player-edit-actions">
                  <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy} onClick={saveEdit}>
                    Save
                  </button>
                  <button className="btn-sm" style={{ flex: 'unset' }} onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={p.id} className={`player-row${p.is_eliminated ? ' eliminated' : ''}`}>
              <div className="player-id">
                <div className="roster-avatar" style={{ width: 36, height: 36, fontSize: 15 }}>
                  {p.avatar_url ? (
                    <img className="avatar-img" src={p.avatar_url} alt="" />
                  ) : (
                    p.name[0]?.toUpperCase() ?? '?'
                  )}
                </div>
                <div>
                  <div className="player-name">
                    {p.name}
                    {moleId === p.id && <span className="tag-mole"> · MOLE</span>}
                    {p.is_eliminated && <span className="tag-elim"> · ELIMINATED</span>}
                  </div>
                  <div className="mono-dim">{codenameFor(p.name, p.codename)}</div>
                </div>
              </div>
              <div className="player-actions">
                <button
                  className={`btn-sm${moleId === p.id ? ' on' : ''}`}
                  style={{ flex: 'unset' }}
                  disabled={busy}
                  onClick={() => onSetMole(moleId === p.id ? null : p.id)}
                >
                  {moleId === p.id ? '★ Mole' : 'Set Mole'}
                </button>
                <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy} onClick={() => startEdit(p)}>
                  Edit
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
