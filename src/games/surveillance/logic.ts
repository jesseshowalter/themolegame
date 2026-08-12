/**
 * Surveillance — pure core logic (no UI, no network).
 *
 * Everything derives from the object list: truth totals, masked camera views,
 * and scoring. This module is the single source of truth for the game rules and
 * must stay framework-agnostic so it can run on the server (masking/scoring) and
 * in tests.
 */

import type {
  Category,
  CameraView,
  PlayerReport,
  SurveillanceMap,
} from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  truth: Record<Category, number>;
}

/** Truth totals are DERIVED from the object list, never stored. */
export function deriveTruth(map: SurveillanceMap): Record<Category, number> {
  const truth: Record<Category, number> = {};
  for (const cat of map.categories) truth[cat] = 0;
  for (const o of map.objects) truth[o.category] = (truth[o.category] ?? 0) + 1;
  return truth;
}

/** Validate an authored map. Errors block shipping; warnings are advisory. */
export function validateMap(map: SurveillanceMap): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (map.playerCount < 3 || map.playerCount > 6)
    errors.push(`playerCount ${map.playerCount} out of range 3..6`);
  if (map.cameras.length !== map.playerCount)
    errors.push(`cameras.length ${map.cameras.length} !== playerCount ${map.playerCount}`);

  const camIds = new Set<string>();
  for (const c of map.cameras) {
    if (camIds.has(c.id)) errors.push(`duplicate camera id ${c.id}`);
    camIds.add(c.id);
    if (!c.cone || c.cone.length < 3)
      errors.push(`camera ${c.id} needs a cone polygon (>= 3 points)`);
  }

  const objIds = new Set<string>();
  const camsThatSee = new Set<string>();
  for (const o of map.objects) {
    if (objIds.has(o.id)) errors.push(`duplicate object id ${o.id}`);
    objIds.add(o.id);
    if (!o.seenBy || o.seenBy.length === 0)
      errors.push(`object ${o.id} is a BLIND SPOT (seenBy empty) — not allowed`);
    for (const cid of o.seenBy ?? []) {
      if (!camIds.has(cid)) errors.push(`object ${o.id} references unknown camera ${cid}`);
      else camsThatSee.add(cid);
    }
    if (!map.categories.includes(o.category))
      errors.push(`object ${o.id} category "${o.category}" not in map.categories`);
  }

  for (const c of map.cameras)
    if (!camsThatSee.has(c.id)) warnings.push(`camera ${c.id} sees no objects (dead camera)`);

  const truth = deriveTruth(map);
  for (const cat of map.categories)
    if ((truth[cat] ?? 0) === 0) warnings.push(`category "${cat}" has 0 objects`);

  const hasOverlap = map.objects.some((o) => (o.seenBy?.length ?? 0) >= 2);
  const hasObscured = map.objects.some((o) => o.obscured);
  if (!hasOverlap && !hasObscured)
    warnings.push(
      `map is TRIVIAL: no overlaps and no obscured objects — the raw sum of reports is always correct, so there is nothing to reconcile and no cover for the Mole`
    );

  return { ok: errors.length === 0, errors, warnings, truth };
}

/**
 * Masking: the ONLY object data the server may send a client during OBSERVE.
 * Deliberately omits seenBy and every object outside this cone.
 */
export function getCameraView(map: SurveillanceMap, cameraId: string): CameraView {
  const cam = map.cameras.find((c) => c.id === cameraId);
  if (!cam) throw new Error(`unknown camera ${cameraId}`);
  const objects = map.objects
    .filter((o) => o.seenBy.includes(cameraId))
    .map((o) => ({ id: o.id, category: o.category, x: o.x, y: o.y, obscured: !!o.obscured }));
  return { cameraId, label: cam.label, cone: cam.cone, categories: map.categories, objects };
}

/**
 * Aggregate private per-cone reports into the proposed total. This is a raw sum
 * that DOUBLE-COUNTS overlap objects on purpose — that gap is the puzzle the
 * crew reconciles (and where the Mole hides).
 */
export function aggregateReports(
  map: SurveillanceMap,
  reports: PlayerReport[]
): Record<Category, number> {
  const proposal: Record<Category, number> = {};
  for (const cat of map.categories) proposal[cat] = 0;
  for (const r of reports)
    for (const cat of map.categories) proposal[cat] += r.counts[cat] ?? 0;
  return proposal;
}

export interface RoundScore {
  perCategoryCorrect: Record<Category, boolean>; // per CATEGORY, never per player
  correctCount: number;
  totalCategories: number;
  banked: number;
}

/** Score the crew's single locked-in final answer. TEAM-LEVEL ONLY. */
export function scoreRound(
  map: SurveillanceMap,
  finalAnswer: Record<Category, number>
): RoundScore {
  const truth = deriveTruth(map);
  const perCategoryCorrect: Record<Category, boolean> = {};
  let correctCount = 0;
  for (const cat of map.categories) {
    const ok = (finalAnswer[cat] ?? null) === truth[cat];
    perCategoryCorrect[cat] = ok;
    if (ok) correctCount++;
  }
  return {
    perCategoryCorrect,
    correctCount,
    totalCategories: map.categories.length,
    banked: correctCount * map.payoutPerCategory,
  };
}
