import * as THREE from 'three';

const STILL_RADIUS = 0.008; // tip must stay within 8 mm…
const HOLD_TIME = 1.0; // …for this long (s)
const MIN_TRAVEL = 0.1; // and must have moved ≥10 cm since the step began

interface Track { anchor: THREE.Vector3; since: number; travel: number; last: THREE.Vector3 }

/**
 * "Touch and hold" capture: the first fingertip that is deliberately moved
 * somewhere and then held still for a second gets captured. A hand that just
 * rests (never moved since the step started) is ignored.
 */
export class HoldCapture {
  private readonly tracks = new Map<string, Track>();
  private time = 0;
  /** Progress 0..1 of the best candidate and where it is (for the ring UI). */
  progress = 0;
  readonly at = new THREE.Vector3();

  reset(): void {
    this.tracks.clear();
    this.time = 0;
    this.progress = 0;
  }

  /** Returns the captured point once, else null. `accept` filters candidates. */
  update(tips: Map<string, THREE.Vector3>, dt: number, accept: (p: THREE.Vector3) => boolean): THREE.Vector3 | null {
    this.time += dt;
    this.progress = 0;
    for (const [id, p] of tips) {
      let t = this.tracks.get(id);
      if (!t) {
        t = { anchor: p.clone(), since: this.time, travel: 0, last: p.clone() };
        this.tracks.set(id, t);
      }
      t.travel += p.distanceTo(t.last);
      t.last.copy(p);
      if (p.distanceTo(t.anchor) > STILL_RADIUS) {
        t.anchor.copy(p);
        t.since = this.time;
      }
      if (t.travel < MIN_TRAVEL || !accept(p)) continue;
      const prog = Math.min(1, (this.time - t.since) / HOLD_TIME);
      if (prog > this.progress) {
        this.progress = prog;
        this.at.copy(t.anchor);
      }
      if (prog >= 1) {
        const out = t.anchor.clone();
        this.reset();
        return out;
      }
    }
    return null;
  }
}
