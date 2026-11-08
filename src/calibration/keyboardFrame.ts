import * as THREE from 'three';
import { buildLayout, type KeyboardLayout, type KeyRange } from './keyboardModel';

/** Fingertip (tip joint) rides a few mm above the surface it touches. */
export const TIP_ABOVE_SURFACE = 0.004;

export interface Nudge { x: number; y: number; z: number }

/** A calibrated keyboard: pose of the local frame in world space + its size. */
export class KeyboardCalibration {
  /** world ← keyboard-local, without nudge */
  readonly base = new THREE.Matrix4();
  /** world ← keyboard-local, nudge applied (use this one) */
  readonly matrix = new THREE.Matrix4();
  readonly inverse = new THREE.Matrix4();
  nudge: Nudge = { x: 0, y: 0, z: 0 };
  layout: KeyboardLayout;

  constructor(base: THREE.Matrix4, public span: number, public range: KeyRange) {
    this.base.copy(base);
    this.layout = buildLayout(range, span);
    this.update();
  }

  setRange(range: KeyRange): void {
    this.range = range;
    this.layout = buildLayout(range, this.span);
  }

  setBase(base: THREE.Matrix4): void {
    this.base.copy(base);
    this.update();
  }

  /** Re-applies the nudge (call after changing `nudge` or `base`). */
  update(): void {
    const n = this.nudge;
    this.matrix.copy(this.base).multiply(new THREE.Matrix4().makeTranslation(n.x, n.y, n.z));
    this.inverse.copy(this.matrix).invert();
  }

  toLocal(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(world).applyMatrix4(this.inverse);
  }
}

/**
 * Two-point refinement from real presses: the player pressed key A at local x
 * `xa` and key B at `xb` (keyboard-local, current grid). Rescales the span and
 * shifts the grid so both keys sit exactly under the fingers. Returns false
 * (and changes nothing) if the needed scale is implausible (>10 %).
 */
export function refineFromPresses(
  cal: KeyboardCalibration, midiA: number, xa: number, midiB: number, xb: number,
): boolean {
  const A = cal.layout.keys.find((k) => k.midi === midiA);
  const B = cal.layout.keys.find((k) => k.midi === midiB);
  if (!A || !B || A.x === B.x) return false;
  const scale = (xb - xa) / (B.x - A.x);
  if (!(scale > 0.9 && scale < 1.1)) return false;
  cal.nudge.x += xa - A.x * scale;
  cal.span *= scale;
  cal.setRange(cal.range); // rebuilds the layout with the new span
  cal.update();
  return true;
}

/**
 * Keyboard frame from two touched points: fingertip on the front edge of the
 * lowest key (left) and of the highest key (right). +x runs left→right, +y is
 * world-up made perpendicular to x, so +z (= x × y) faces the player.
 */
export function frameFromPoints(left: THREE.Vector3, right: THREE.Vector3): { base: THREE.Matrix4; span: number } {
  const x = right.clone().sub(left);
  const span = x.length();
  x.normalize();
  const y = new THREE.Vector3(0, 1, 0);
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const origin = left.clone().addScaledVector(y, -TIP_ABOVE_SURFACE);
  const base = new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
  return { base, span };
}

/** Sanity check of a measured span against the preset (white key pitch 18–28 mm). */
export function plausiblePitch(layout: KeyboardLayout): boolean {
  return layout.pitch > 0.018 && layout.pitch < 0.028;
}
