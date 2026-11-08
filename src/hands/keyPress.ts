import * as THREE from 'three';
import type { KeyboardCalibration } from '../calibration/keyboardFrame';
import { keyAt } from '../calibration/keyboardModel';

/** Depth below the key top (m) that counts as a press; key travel is ~10 mm. */
export const PRESS_DEPTH = 0.005;
/** Rising back above this depth releases the key (hysteresis vs. tracking noise). */
export const RELEASE_DEPTH = 0.0;
/** A press must be a real downward stroke: ≥ this much descent… */
export const STROKE = 0.008;
/** …within this time window (s). A finger resting on a key only jitters. */
const STROKE_WINDOW = 0.5;
/** Deeper than this the tip is under/behind the keyboard, not on a key. */
const MAX_DEPTH = 0.045;

export interface KeyEvent {
  type: 'down' | 'up';
  midi: number;
  tipId: string;
  /** on 'up': deepest point reached during the press (m below the key top) */
  maxDepth?: number;
}

interface TipState {
  midi: number | null;
  prevDepth: number | null;
  maxDepth: number;
  hist: { t: number; depth: number }[];
}

/**
 * Turns fingertip positions into key down/up events using the calibrated grid.
 * Each fingertip is independent (a resting finger never blocks another one).
 */
export class KeyPressDetector {
  private readonly tips = new Map<string, TipState>();
  private readonly local = new THREE.Vector3();
  private time = 0;
  /** Press threshold below the key top; lower it to catch shallow presses. */
  pressDepth = PRESS_DEPTH;

  constructor(private readonly cal: KeyboardCalibration) {}

  /** Keys currently held down, by tip id. */
  held(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, s] of this.tips) if (s.midi !== null) out.set(id, s.midi);
    return out;
  }

  update(tips: Map<string, THREE.Vector3>, dt: number): KeyEvent[] {
    this.time += dt;
    const events: KeyEvent[] = [];
    for (const [id, world] of tips) {
      let s = this.tips.get(id);
      if (!s) {
        s = { midi: null, prevDepth: null, maxDepth: 0, hist: [] };
        this.tips.set(id, s);
      }
      this.cal.toLocal(world, this.local);
      const key = keyAt(this.cal.layout, this.local.x, this.local.z);
      const depth = key ? key.top - this.local.y : null;
      const onKey = key !== null && depth !== null && depth < MAX_DEPTH;

      if (onKey) s.hist.push({ t: this.time, depth: depth! });
      else s.hist.length = 0;
      while (s.hist.length && s.hist[0].t < this.time - STROKE_WINDOW) s.hist.shift();

      if (s.midi !== null) {
        s.maxDepth = Math.max(s.maxDepth, depth ?? 0);
        // Released: lifted, slid off the key area, or moved onto another key.
        if (!onKey || depth! < RELEASE_DEPTH || key!.midi !== s.midi) {
          events.push({ type: 'up', midi: s.midi, tipId: id, maxDepth: s.maxDepth });
          s.midi = null;
        }
      }
      if (s.midi === null && onKey && depth! >= this.pressDepth) {
        // Must cross the threshold coming from above, as part of a real stroke.
        const crossed = s.prevDepth !== null && s.prevDepth < this.pressDepth;
        const shallowest = Math.min(...s.hist.map((h) => h.depth));
        if (crossed && depth! - shallowest >= STROKE) {
          s.midi = key!.midi;
          s.maxDepth = depth!;
          events.push({ type: 'down', midi: key!.midi, tipId: id });
        }
      }
      s.prevDepth = onKey ? depth : null;
    }
    for (const [id, s] of this.tips) {
      if (tips.has(id)) continue;
      if (s.midi !== null) events.push({ type: 'up', midi: s.midi, tipId: id, maxDepth: s.maxDepth });
      this.tips.delete(id);
    }
    return events;
  }
}
