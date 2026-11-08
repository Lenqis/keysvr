import * as THREE from 'three';
import type { Button3D } from './button3d';

const HOVER_DIST = 0.06; // fingertip within 6 cm in front of the face → hover
const PRESS_DIST = 0.004; // fingertip reaches (almost) the face → press
const RELEASE_DIST = 0.02; // must back off this far before the next press
const MARGIN = 0.01; // a little forgiveness around the button edges

/**
 * Poke interaction for one button. Every fingertip is tracked separately
 * (keyed by id, e.g. "right-ring"): a finger presses when it crosses the face
 * coming from the front, and must back off before it can press again. Other
 * fingers resting near the button never block it.
 */
export class PokeTarget {
  private readonly prevZ = new Map<string, number | null>();
  private readonly armed = new Map<string, boolean>();
  private readonly local = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();

  constructor(private readonly button: Button3D) {}

  /** Local z of a tip in front of/inside the button outline, or null when outside. */
  private localZ(tip: THREE.Vector3): number | null {
    const b = this.button;
    this.local.copy(tip).applyMatrix4(this.inv);
    const inside =
      Math.abs(this.local.x) <= b.width / 2 + MARGIN &&
      Math.abs(this.local.y) <= b.height / 2 + MARGIN &&
      this.local.z > -0.05;
    return inside ? this.local.z : null;
  }

  /** Call every frame with world-space fingertips by id. Returns true on a new press. */
  update(tips: Map<string, THREE.Vector3>, rayHover: boolean): boolean {
    this.inv.copy(this.button.group.matrixWorld).invert();
    let pressed = false;
    let touching = false;
    let hover = rayHover;
    for (const [id, tip] of tips) {
      const z = this.localZ(tip);
      const prev = this.prevZ.get(id) ?? null;
      let armed = this.armed.get(id) ?? true;
      if (z === null || z > RELEASE_DIST) armed = true;
      // Press only when the finger crosses the face from the front this frame.
      const crossed = z !== null && z <= PRESS_DIST && (prev === null || prev > PRESS_DIST);
      if (crossed && armed && (prev !== null || z > -0.01)) {
        armed = false;
        pressed = true;
      }
      if (z !== null && z <= PRESS_DIST && !armed) touching = true;
      if (z !== null && z <= HOVER_DIST) hover = true;
      this.armed.set(id, armed);
      this.prevZ.set(id, z);
    }
    for (const id of [...this.prevZ.keys()]) {
      if (!tips.has(id)) { this.prevZ.delete(id); this.armed.delete(id); }
    }
    this.button.setState(touching ? 'pressed' : hover ? 'hover' : 'idle');
    if (pressed) this.button.press();
    return pressed;
  }
}

/** Ray hit test helper for controllers / pinch rays. */
export function rayHits(
  raycaster: THREE.Raycaster,
  origin: THREE.Object3D,
  target: THREE.Object3D,
): THREE.Intersection | null {
  const m = origin.matrixWorld;
  raycaster.ray.origin.setFromMatrixPosition(m);
  raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
  const hits = raycaster.intersectObject(target, true);
  return hits[0] ?? null;
}
