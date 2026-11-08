import * as THREE from 'three';

const STILL_RADIUS = 0.008; // tip must stay within 8 mm…
const HOLD_TIME = 1.0; // …for this long (s)
const DESCENT = 0.025; // and must have come down ≥2.5 cm onto the spot…
const DESCENT_WINDOW = 1.0; // …within this many seconds before it stopped

interface Track { anchor: THREE.Vector3; since: number; descended: boolean; hist: { t: number; y: number }[] }

/**
 * "Touch and hold" capture: a fingertip that comes down onto a spot and stays
 * still for a second gets captured. A hand hovering in the air or resting on
 * the lap (no downward approach) is ignored.
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
    // A tip that dropped out of tracking starts over (no stale history).
    for (const id of [...this.tracks.keys()]) if (!tips.has(id)) this.tracks.delete(id);
    for (const [id, p] of tips) {
      let t = this.tracks.get(id);
      if (!t) {
        t = { anchor: p.clone(), since: this.time, descended: false, hist: [] };
        this.tracks.set(id, t);
      }
      t.hist.push({ t: this.time, y: p.y });
      while (t.hist.length && t.hist[0].t < this.time - DESCENT_WINDOW - HOLD_TIME) t.hist.shift();
      if (p.distanceTo(t.anchor) > STILL_RADIUS) {
        // Moved: restart the hold here; remember whether it arrived from above.
        t.anchor.copy(p);
        t.since = this.time;
        const recentMax = Math.max(...t.hist.filter((h) => h.t >= this.time - DESCENT_WINDOW).map((h) => h.y));
        t.descended = recentMax - p.y >= DESCENT;
      } else if (!t.descended) {
        // Still settling: the descent may have finished within the window.
        const recentMax = Math.max(...t.hist.filter((h) => h.t >= t!.since - DESCENT_WINDOW).map((h) => h.y));
        t.descended = recentMax - t.anchor.y >= DESCENT;
      }
      if (!t.descended || !accept(p)) continue;
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

/** Is `pt` within `deg` degrees of where the player looks? */
export function inGaze(head: THREE.Vector3, forward: THREE.Vector3, pt: THREE.Vector3, deg: number): boolean {
  const dir = pt.clone().sub(head).normalize();
  return dir.dot(forward) > Math.cos(THREE.MathUtils.degToRad(deg));
}
