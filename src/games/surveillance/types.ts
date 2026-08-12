/**
 * Surveillance — data model (Game 1 of the online Mole adaptation).
 * See docs/surveillance-integration.md for how this plugs into the app.
 *
 * Object-centric schema: the map is a flat list of objects, each tagged with
 * the cameras that can see it. Truth totals and each camera's masked view are
 * DERIVED from this one list, which makes an inconsistent map nearly impossible
 * to author.
 */

export type Category = string; // "guard" | "teller" | "bag" | "exit" | ...

export interface MapObject {
  id: string;
  category: Category;
  x: number; // position on the schematic (for rendering)
  y: number;
  seenBy: string[]; // camera ids that can see it; MUST be length >= 1 (no blind spots)
  obscured?: boolean; // hard to count; render fuzzy; a good Mole target
}

export interface Camera {
  id: string; // "cam1"
  label?: string; // "Lobby NW"
  cone: Array<{ x: number; y: number }>; // polygon for the lit sightline
}

export interface SurveillanceMap {
  id: string;
  playerCount: number; // 3..6, must equal cameras.length
  categories: Category[]; // categories this map uses
  cameras: Camera[];
  objects: MapObject[];
  timerSeconds: number; // OBSERVE window (default 15)
  payoutPerCategory: number; // $ banked per correct category
}

/** A single player's private per-cone report (REPORT phase). */
export interface PlayerReport {
  cameraId: string;
  counts: Record<Category, number>;
}

/** The ONLY object data the server sends a client during OBSERVE (masked). */
export interface CameraView {
  cameraId: string;
  label?: string;
  cone: Array<{ x: number; y: number }>;
  categories: Category[];
  objects: Array<{ id: string; category: Category; x: number; y: number; obscured: boolean }>;
}
