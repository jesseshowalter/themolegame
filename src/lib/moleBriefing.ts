/**
 * A mole round briefing = a freeform description (shown as a paragraph) plus a
 * list of objectives (shown as bordered mission items). We serialize both into
 * the single `mole_briefings.body` text column as JSON, so no schema change is
 * needed and the pass-through RPCs stay untouched.
 *
 * Legacy bodies (plain text saved before this split) are read as objectives,
 * one per line, with an empty description.
 */
export interface MoleBrief {
  title: string; // optional display heading (used by mission briefings)
  description: string;
  objectives: string[];
}

function linesToObjectives(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•▸]\s*/, '').trim())
    .filter(Boolean);
}

export function parseMoleBrief(body: string | null | undefined): MoleBrief {
  if (!body) return { title: '', description: '', objectives: [] };
  try {
    const o = JSON.parse(body);
    if (o && typeof o === 'object' && ('description' in o || 'objectives' in o || 'title' in o)) {
      return {
        title: typeof o.title === 'string' ? o.title : '',
        description: typeof o.description === 'string' ? o.description : '',
        objectives: Array.isArray(o.objectives) ? o.objectives.map(String).filter(Boolean) : [],
      };
    }
  } catch {
    /* not JSON — fall through to legacy handling */
  }
  return { title: '', description: '', objectives: linesToObjectives(body) };
}

export function serializeMoleBrief(
  description: string,
  objectivesText: string,
  title = ''
): string {
  return JSON.stringify({
    title: title.trim(),
    description: description.trim(),
    objectives: linesToObjectives(objectivesText),
  });
}
