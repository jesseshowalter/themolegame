import { describe, it, expect } from 'vitest';
import { deriveTruth, validateMap, getCameraView } from './logic';
import { downtownBranch } from './maps/downtownBranch';
import type { SurveillanceMap } from './types';

describe('surveillance logic', () => {
  it('(a) validates Downtown Branch with zero errors', () => {
    const res = validateMap(downtownBranch);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    // Reference map must never be trivial.
    expect(res.warnings.some((w) => w.includes('TRIVIAL'))).toBe(false);
  });

  it('(b) deriveTruth returns 4 guards / 3 tellers / 6 bags / 2 exits', () => {
    expect(deriveTruth(downtownBranch)).toEqual({ guard: 4, teller: 3, bag: 6, exit: 2 });
  });

  it('(c) a blind-spot object (seenBy []) fails validation', () => {
    const broken: SurveillanceMap = {
      ...downtownBranch,
      objects: [
        ...downtownBranch.objects,
        { id: 'blind', category: 'guard', x: 0, y: 0, seenBy: [] },
      ],
    };
    const res = validateMap(broken);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('BLIND SPOT'))).toBe(true);
  });

  it('(d) a map with no overlaps and no obscured objects warns TRIVIAL', () => {
    const trivial: SurveillanceMap = {
      id: 'trivial_3p',
      playerCount: 3,
      categories: ['guard'],
      timerSeconds: 15,
      payoutPerCategory: 10,
      cameras: [
        { id: 'cam1', cone: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
        { id: 'cam2', cone: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
        { id: 'cam3', cone: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
      ],
      objects: [
        { id: 'g1', category: 'guard', x: 0, y: 0, seenBy: ['cam1'] },
        { id: 'g2', category: 'guard', x: 0, y: 0, seenBy: ['cam2'] },
        { id: 'g3', category: 'guard', x: 0, y: 0, seenBy: ['cam3'] },
      ],
    };
    const res = validateMap(trivial);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes('TRIVIAL'))).toBe(true);
  });

  it('(e) getCameraView(cam5) returns only cam5 objects and never leaks seenBy', () => {
    const view = getCameraView(downtownBranch, 'cam5');
    // cam5 sees g4, b4, b5, b6 => 4 objects.
    expect(view.objects).toHaveLength(4);
    expect(view.objects.map((o) => o.id).sort()).toEqual(['b4', 'b5', 'b6', 'g4']);
    // The masked payload must not carry seenBy on any object.
    for (const o of view.objects) {
      expect(o).not.toHaveProperty('seenBy');
    }
    // Serialized payload must not mention any other camera or seenBy at all.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('seenBy');
    expect(serialized).not.toContain('cam1');
    expect(serialized).not.toContain('cam4');
  });

  it('getCameraView throws on an unknown camera', () => {
    expect(() => getCameraView(downtownBranch, 'nope')).toThrow(/unknown camera/);
  });
});
