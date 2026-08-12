import type { SurveillanceMap } from '../types';

/**
 * Reference map — "Downtown Branch" (5 players). Validated: passes validateMap
 * with zero errors and no TRIVIAL warning.
 *
 * Truth (derived): Guards 4, Tellers 3, Bags 6, Exits 2.
 * Overlaps: shared guard (cam4/cam5), shared teller (cam1/cam2), shared bag
 * (cam4/cam5, obscured vault). Coordinates are placeholders for the art pass;
 * the `seenBy` mapping is the authoritative game logic.
 */
export const downtownBranch: SurveillanceMap = {
  id: 'downtown_branch_5p',
  playerCount: 5,
  categories: ['guard', 'teller', 'bag', 'exit'],
  timerSeconds: 15,
  payoutPerCategory: 10,
  cameras: [
    { id: 'cam1', label: 'Lobby NW', cone: [{ x: 40, y: 40 }, { x: 360, y: 40 }, { x: 300, y: 300 }, { x: 40, y: 300 }] },
    { id: 'cam2', label: 'Lobby NE', cone: [{ x: 360, y: 40 }, { x: 680, y: 40 }, { x: 680, y: 300 }, { x: 320, y: 300 }] },
    { id: 'cam3', label: 'Hall SW', cone: [{ x: 40, y: 320 }, { x: 360, y: 320 }, { x: 360, y: 660 }, { x: 40, y: 660 }] },
    { id: 'cam4', label: 'Vault approach', cone: [{ x: 380, y: 320 }, { x: 760, y: 320 }, { x: 760, y: 660 }, { x: 380, y: 660 }] },
    { id: 'cam5', label: 'Vault interior', cone: [{ x: 760, y: 220 }, { x: 960, y: 220 }, { x: 960, y: 560 }, { x: 760, y: 560 }] },
  ],
  objects: [
    { id: 'g1', category: 'guard', x: 120, y: 120, seenBy: ['cam1'] },
    { id: 'g2', category: 'guard', x: 520, y: 120, seenBy: ['cam2'] },
    { id: 'g3', category: 'guard', x: 500, y: 480, seenBy: ['cam4'] },
    { id: 'g4', category: 'guard', x: 745, y: 400, seenBy: ['cam4', 'cam5'] },
    { id: 't1', category: 'teller', x: 180, y: 200, seenBy: ['cam1'] },
    { id: 't2', category: 'teller', x: 340, y: 200, seenBy: ['cam1', 'cam2'] },
    { id: 't3', category: 'teller', x: 560, y: 200, seenBy: ['cam2'] },
    { id: 'b1', category: 'bag', x: 600, y: 260, seenBy: ['cam2'] },
    { id: 'b2', category: 'bag', x: 160, y: 520, seenBy: ['cam3'] },
    { id: 'b3', category: 'bag', x: 480, y: 560, seenBy: ['cam4'] },
    { id: 'b4', category: 'bag', x: 800, y: 420, seenBy: ['cam4', 'cam5'], obscured: true },
    { id: 'b5', category: 'bag', x: 880, y: 320, seenBy: ['cam5'], obscured: true },
    { id: 'b6', category: 'bag', x: 900, y: 480, seenBy: ['cam5'], obscured: true },
    { id: 'e1', category: 'exit', x: 80, y: 80, seenBy: ['cam1'] },
    { id: 'e2', category: 'exit', x: 80, y: 620, seenBy: ['cam3'] },
  ],
};
