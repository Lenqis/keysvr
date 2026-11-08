import * as THREE from 'three';
import type { Button3D } from './button3d';

const HOVER_DIST = 0.06; // fingertip within 6 cm in front of the face → hover
const PRESS_DIST = 0.004; // fingertip reaches (almost) the face → press
const RELEASE_DIST = 0.03; // must back off this far before the next press
const MARGIN = 0.01; // a little forgiveness around the button edges

/**
 * Poke interaction for one button: any fingertip (index preferred) touching the
 * front face presses it. Must be approached from the front, and released
 * between presses, so resting a hand on it doesn't spam.
 */
export class PokeTarget {
  private armed = true;
  private readonly local = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();

  constructor(private readonly button: Button3D) {}

  /** Returns the closest local z of any tip inside the button outline, or null. */
  private closestZ(tips: THREE.Vector3[]): number | null {
    const b = this.button;
    this.inv.copy(b.group.matrixWorld).invert();
    let best: number | null = null;
    for (const tip of tips) {
      this.local.copy(tip).applyMatrix4(this.inv);
      const inside =
        Math.abs(this.local.x) <= b.width / 2 + MARGIN &&
        Math.abs(this.local.y) <= b.height / 2 + MARGIN &&
        this.local.z > -0.05;
      if (inside && (best === null || this.local.z < best)) best = this.local.z;
    }
    return best;
  }

  /** Call every frame with world-space fingertip positions. Returns true on a new press. */
  update(tips: THREE.Vector3[], rayHover: boolean): boolean {
    const z = this.closestZ(tips);
    let pressed = false;
    if (z !== null && z <= PRESS_DIST && this.armed) {
      this.armed = false;
      pressed = true;
    }
    if (z === null || z > RELEASE_DIST) this.armed = true;

    const touching = z !== null && z <= PRESS_DIST && !this.armed;
    const hover = rayHover || (z !== null && z <= HOVER_DIST);
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
