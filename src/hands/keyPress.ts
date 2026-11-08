import * as THREE from 'three';
import type { KeyboardCalibration } from '../calibration/keyboardFrame';
import { keyAt } from '../calibration/keyboardModel';

/** Depth below the key top (m) that counts as a press; key travel is ~10 mm. */
export const PRESS_DEPTH = 0.006;
/** Rising back above this depth releases the key (hysteresis vs. tracking noise). */
export const RELEASE_DEPTH = 0.002;
/** Deeper than this the tip is under/behind the keyboard, not on a key. */
const MAX_DEPTH = 0.04;

export interface KeyEvent { type: 'down' | 'up'; midi: number; tipId: string }

interface TipState { midi: number | null; prevDepth: number | null }

/**
 * Turns fingertip positions into key down/up events using the calibrated grid.
 * Each fingertip is independent (a resting finger never blocks another one).
 */
export class KeyPressDetector {
  private readonly tips = new Map<string, TipState>();
  private readonly local = new THREE.Vector3();

  constructor(private readonly cal: KeyboardCalibration) {}

  /** Keys currently held down, by tip id. */
  held(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, s] of this.tips) if (s.midi !== null) out.set(id, s.midi);
    return out;
  }

  update(tips: Map<string, THREE.Vector3>): KeyEvent[] {
    const events: KeyEvent[] = [];
    for (const [id, world] of tips) {
      const s = this.tips.get(id) ?? { midi: null, prevDepth: null };
      this.tips.set(id, s);
      this.cal.toLocal(world, this.local);
      const key = keyAt(this.cal.layout, this.local.x, this.local.z);
      const depth = key ? key.top - this.local.y : null;
      const onKey = key !== null && depth !== null && depth < MAX_DEPTH;

      if (s.midi !== null) {
        // Released: lifted, slid off the key area, or moved onto another key.
        if (!onKey || depth! < RELEASE_DEPTH || key!.midi !== s.midi) {
          events.push({ type: 'up', midi: s.midi, tipId: id });
          s.midi = null;
        }
      }
      if (s.midi === null && onKey && depth! >= PRESS_DEPTH) {
        // Must come from above (not appear already deep, e.g. hand under the keys).
        const cameFromAbove = s.prevDepth !== null && s.prevDepth < PRESS_DEPTH;
        if (cameFromAbove) {
          s.midi = key!.midi;
          events.push({ type: 'down', midi: key!.midi, tipId: id });
        }
      }
      s.prevDepth = onKey ? depth : null;
    }
    for (const [id, s] of this.tips) {
      if (tips.has(id)) continue;
      if (s.midi !== null) events.push({ type: 'up', midi: s.midi, tipId: id });
      this.tips.delete(id);
    }
    return events;
  }
}
