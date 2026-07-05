import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Quiz } from '../lib/types';
import { parseMoleBrief, serializeMoleBrief } from '../lib/moleBriefing';

type Variant = 'mission' | 'intro' | 'endgame';

interface Props {
  round: Quiz;
  onClose: () => void;
  variant?: Variant;
}

// Per-variant copy so the same editor serves mission, pre-game and endgame
// briefings — all stored the same way on quizzes.mission_briefing.
const COPY: Record<Variant, {
  heading: (r: Quiz) => string;
  sectionLabel: string;
  hint: string;
  titleLabel?: string; // when set, an editable heading field appears
  titlePlaceholder?: string;
  descLabel: string;
  descPlaceholder: string;
  objLabel: string;
  objPlaceholder: string;
}> = {
  mission: {
    heading: (r) => `ROUND ${r.round_number} · ${r.title} — MISSION`,
    sectionLabel: 'Mission briefing — shown to all players when you send it',
    hint: "Name the mission, describe the challenge, then list what players should do. Each objective line becomes its own item on the players' screens.",
    titleLabel: 'Mission title — the large heading players see',
    titlePlaceholder: 'THE CASING',
    descLabel: 'Description',
    descPlaceholder:
      'Build the best 5-card poker hand as a team by collecting cards hidden around the house.',
    objLabel: 'Objectives — one per line',
    objPlaceholder:
      'Find all 5 hidden cards within 10 minutes\nAgree on which cards to keep as a group\nNo phones during the challenge',
  },
  intro: {
    heading: () => 'PRE-GAME · OPERATION BRIEFING',
    sectionLabel: 'Operation briefing — the rules screen shown when you launch it',
    hint: "Explain how the game works and what to watch for. Each tip line becomes its own item on the players' screens.",
    descLabel: 'Overview & rules',
    descPlaceholder:
      'One of you is the Mole, secretly sabotaging every round. Complete missions and quizzes to survive — the lowest scorer each round is eliminated. Figure out who the Mole is before the end.',
    objLabel: 'Strategy tips / what to look out for — one per line',
    objPlaceholder:
      'Watch for someone quietly steering the group toward failure\nWrong answers on the quiz cost you — but so does over-trusting\nKeep notes; the Mole blends in',
  },
  endgame: {
    heading: () => 'ENDGAME · THE REVEAL',
    sectionLabel: 'Endgame message — shown with the Mole reveal when you launch it',
    hint: 'The Mole’s identity is revealed automatically. Add a closing/thank-you message and any final notes.',
    descLabel: 'Closing message',
    descPlaceholder:
      'That’s a wrap, agents. Thank you all for playing The Mole tonight — the drinks are on the house.',
    objLabel: 'Final notes — one per line (optional)',
    objPlaceholder: 'Winner takes the trophy\nRogue Agent prize goes to the top eliminated player',
  },
};

/**
 * Edit a briefing's public description + objectives shown to every player when
 * the host broadcasts it. Serves round missions plus the pre-game and endgame
 * bookend briefings (via `variant`). Stored on quizzes.mission_briefing.
 */
export default function MissionEditor({ round, onClose, variant = 'mission' }: Props) {
  const copy = COPY[variant];
  const initial = parseMoleBrief(round.mission_briefing);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [objectives, setObjectives] = useState(initial.objectives.join('\n'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('quizzes')
      .update({ mission_briefing: serializeMoleBrief(description, objectives, title) })
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
        <div className="editor-title">{copy.heading(round)}</div>
      </div>

      <div>
        <p className="section-label">{copy.sectionLabel}</p>
        <p className="setup-hint">{copy.hint}</p>

        {copy.titleLabel && (
          <>
            <label className="q-label">{copy.titleLabel}</label>
            <input
              className="q-input"
              placeholder={copy.titlePlaceholder}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMsg(null);
              }}
            />
          </>
        )}

        <label className="q-label">{copy.descLabel}</label>
        <textarea
          className="import-area"
          style={{ minHeight: 100 }}
          spellCheck={false}
          placeholder={copy.descPlaceholder}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setMsg(null);
          }}
        />

        <label className="q-label">{copy.objLabel}</label>
        <textarea
          className="import-area"
          style={{ minHeight: 120 }}
          spellCheck={false}
          placeholder={copy.objPlaceholder}
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
