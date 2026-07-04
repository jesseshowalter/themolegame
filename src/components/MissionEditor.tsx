import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Quiz } from '../lib/types';
import { parseMoleBrief, serializeMoleBrief } from '../lib/moleBriefing';

interface Props {
  round: Quiz;
  onClose: () => void;
}

/**
 * Edit a round's MISSION briefing — the public challenge description + objectives
 * shown to every player when the host opens the mission. Stored on
 * quizzes.mission_briefing (description + objectives serialized as JSON).
 */
export default function MissionEditor({ round, onClose }: Props) {
  const initial = parseMoleBrief(round.mission_briefing);
  const [description, setDescription] = useState(initial.description);
  const [objectives, setObjectives] = useState(initial.objectives.join('\n'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('quizzes')
      .update({ mission_briefing: serializeMoleBrief(description, objectives) })
      .eq('id', round.id);
    setBusy(false);
    setMsg(error ? `❌ ${error.message}` : '✅ Saved');
  }

  return (
    <div className="host">
      <div className="editor-head">
        <button className="back-btn" onClick={onClose}>
          ← Dashboard
        </button>
        <div className="editor-title">
          ROUND {round.round_number} · {round.title} — MISSION
        </div>
      </div>

      <div>
        <p className="section-label">Mission briefing — shown to all players when you send it</p>
        <p className="setup-hint">
          Describe the challenge, then list what players should do. Each objective line
          becomes its own item on the players' screens.
        </p>

        <label className="q-label">Description</label>
        <textarea
          className="import-area"
          style={{ minHeight: 100 }}
          spellCheck={false}
          placeholder="Build the best 5-card poker hand as a team by collecting cards hidden around the house."
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setMsg(null);
          }}
        />

        <label className="q-label">Objectives — one per line</label>
        <textarea
          className="import-area"
          style={{ minHeight: 120 }}
          spellCheck={false}
          placeholder={'Find all 5 hidden cards within 10 minutes\nAgree on which cards to keep as a group\nNo phones during the challenge'}
          value={objectives}
          onChange={(e) => {
            setObjectives(e.target.value);
            setMsg(null);
          }}
        />

        <div className="round-actions" style={{ marginTop: 8 }}>
          <button className="btn-sm" style={{ flex: 'unset' }} disabled={busy} onClick={save}>
            Save briefing
          </button>
          {msg && (
            <span className="mono-dim" style={{ alignSelf: 'center' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
