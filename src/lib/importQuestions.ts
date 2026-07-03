/**
 * Parser + validator for the host "Upload questions" panel.
 *
 * Accepts a forgiving JSON shape so authoring is easy. Canonical form:
 *
 * {
 *   "rounds": [
 *     {
 *       "round": 1,
 *       "title": "BRIEFING",
 *       "subtitle": "Establish the field.",
 *       "questions": [
 *         {
 *           "prompt": "WHO WAS SEEN EXITING THE COMPOUND?",
 *           "type": "mc",                 // "mc" (default) or "tf"
 *           "options": ["A", "B", "C"],
 *           "correct": 2,                  // 0-based index, or letter "C", or for tf a boolean
 *           "meta_id": "MOLE-1-032",       // optional flavor
 *           "meta_coord": "52.37° N"       // optional flavor
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * Conveniences:
 * - Top level may be the object above, or a bare array of rounds.
 * - `round` may also be `round_number`; `prompt` may also be `q` or `text`.
 * - `type` accepts mc / multiple / choice, and tf / truefalse / boolean.
 * - true/false questions may omit `options` (defaults to ["TRUE","FALSE"]) and
 *   set `correct` to a boolean or "true"/"false".
 * - `correct` may be a 0-based index or a letter ("A".."H").
 */

export interface ParsedQuestion {
  prompt: string;
  type: 'mc' | 'tf';
  options: string[];
  correct_index: number;
  points: number;
  meta_id: string | null;
  meta_coord: string | null;
}

export interface ParsedRound {
  round_number: number;
  title: string;
  subtitle: string | null;
  questions: ParsedQuestion[];
}

export interface ParseResult {
  rounds: ParsedRound[];
  errors: string[];
}

function normType(v: unknown): 'mc' | 'tf' {
  const s = String(v ?? 'mc').toLowerCase();
  if (['tf', 'truefalse', 'true/false', 'boolean', 'bool'].includes(s)) return 'tf';
  return 'mc';
}

function resolveCorrect(raw: unknown, options: string[], type: 'mc' | 'tf'): number | null {
  // Boolean / "true"/"false" for true-false questions.
  if (typeof raw === 'boolean') return raw ? 0 : 1;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (type === 'tf' && /^(true|false)$/i.test(s)) return /^true$/i.test(s) ? 0 : 1;
    // Single letter answer, e.g. "C".
    if (/^[a-z]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
    // Numeric string.
    if (/^\d+$/.test(s)) return Number(s);
    // Match the exact option text.
    const idx = options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
    return null;
  }
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  return null;
}

export function parseQuestionImport(text: string): ParseResult {
  const errors: string[] = [];
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch (e) {
    return { rounds: [], errors: [`Invalid JSON: ${(e as Error).message}`] };
  }

  const rawRounds: unknown = Array.isArray(data)
    ? data
    : (data as { rounds?: unknown })?.rounds;

  if (!Array.isArray(rawRounds)) {
    return {
      rounds: [],
      errors: ['Expected a top-level "rounds" array (or a bare array of rounds).'],
    };
  }

  const rounds: ParsedRound[] = [];
  const seenRoundNumbers = new Set<number>();

  rawRounds.forEach((r, ri) => {
    const where = `Round #${ri + 1}`;
    const obj = (r ?? {}) as Record<string, unknown>;
    const roundNumber = Number(obj.round ?? obj.round_number);
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      errors.push(`${where}: missing/invalid "round" number.`);
      return;
    }
    if (seenRoundNumbers.has(roundNumber)) {
      errors.push(`${where}: duplicate round number ${roundNumber}.`);
      return;
    }
    seenRoundNumbers.add(roundNumber);

    const title = String(obj.title ?? `ROUND ${roundNumber}`).trim();
    const subtitle =
      obj.subtitle != null && String(obj.subtitle).trim() !== ''
        ? String(obj.subtitle).trim()
        : null;

    const rawQuestions = obj.questions;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      errors.push(`Round ${roundNumber}: needs a non-empty "questions" array.`);
      return;
    }

    const questions: ParsedQuestion[] = [];
    rawQuestions.forEach((q, qi) => {
      const qwhere = `Round ${roundNumber} · Q${qi + 1}`;
      const qo = (q ?? {}) as Record<string, unknown>;
      const prompt = String(qo.prompt ?? qo.q ?? qo.text ?? '').trim();
      if (!prompt) {
        errors.push(`${qwhere}: missing "prompt".`);
        return;
      }
      const type = normType(qo.type);
      let options: string[];
      if (Array.isArray(qo.options) && qo.options.length > 0) {
        options = qo.options.map((o) => String(o));
      } else if (type === 'tf') {
        options = ['TRUE', 'FALSE'];
      } else {
        errors.push(`${qwhere}: multiple-choice question needs an "options" array.`);
        return;
      }
      if (options.length > 8) {
        errors.push(`${qwhere}: max 8 options (got ${options.length}).`);
        return;
      }

      const correct = resolveCorrect(qo.correct ?? qo.correct_index ?? qo.answer, options, type);
      if (correct === null) {
        errors.push(`${qwhere}: missing/unrecognized "correct" answer.`);
        return;
      }
      if (correct < 0 || correct >= options.length) {
        errors.push(
          `${qwhere}: "correct" index ${correct} is out of range (0–${options.length - 1}).`
        );
        return;
      }

      const points = Number.isFinite(Number(qo.points)) ? Math.max(1, Number(qo.points)) : 1;

      questions.push({
        prompt,
        type,
        options,
        correct_index: correct,
        points,
        meta_id: qo.meta_id != null ? String(qo.meta_id) : null,
        meta_coord: qo.meta_coord != null ? String(qo.meta_coord) : null,
      });
    });

    if (questions.length > 0) {
      rounds.push({ round_number: roundNumber, title, subtitle, questions });
    }
  });

  return { rounds, errors };
}

/** A copy-paste starting point shown in the host UI. */
export const IMPORT_TEMPLATE = `{
  "rounds": [
    {
      "round": 1,
      "title": "BRIEFING",
      "subtitle": "Establish the field. Trust no one.",
      "questions": [
        {
          "prompt": "WHO WAS SEEN EXITING THE COMPOUND AT 02:45?",
          "type": "mc",
          "options": [
            "The one in the kitchen",
            "The one with the exemption",
            "The one with the hidden fingerprint",
            "The one who volunteered"
          ],
          "correct": 2,
          "meta_id": "MOLE-1-032",
          "meta_coord": "52.3702° N, 4.8952° E"
        },
        {
          "prompt": "THE MOLE'S PRIMARY DIRECTIVE TONIGHT IS SABOTAGE.",
          "type": "tf",
          "correct": true
        }
      ]
    },
    {
      "round": 2,
      "title": "SURVEILLANCE",
      "questions": [
        {
          "prompt": "DURING THE BLACKOUT, WHO LEFT WITHOUT AN ALIBI?",
          "options": ["The dealer", "The lookout", "The driver"],
          "correct": "C"
        }
      ]
    }
  ]
}`;
