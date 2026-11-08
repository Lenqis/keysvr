import * as THREE from 'three';
import type { Panel } from '../ui/panel';
import type { KeyboardCalibration } from './keyboardFrame';

interface Head { head: THREE.Vector3; forward: THREE.Vector3; dt: number }

/** Where the calibration/tester panel floats. */
export class PanelPlacement {
  private following = false;

  constructor(private readonly panel: Panel) {}

  /** Above the keyboard's back edge if known, else in front of the player. */
  place(ctx: Head, cal: KeyboardCalibration | null): void {
    if (cal) {
      const pos = new THREE.Vector3(cal.span / 2, 0.27, -cal.layout.whiteLength - 0.02).applyMatrix4(cal.matrix);
      this.panel.group.position.copy(pos);
      this.panel.group.lookAt(ctx.head);
    } else {
      this.panel.placeInFrontOf(ctx.head, ctx.forward, 0.7, 0.12);
    }
  }

  /**
   * No keyboard yet: keep the hint panel in view when the player turns, at eye
   * level (so looking down at the keys never puts it on top of them).
   */
  follow(ctx: Head): void {
    const g = this.panel.group;
    const toPanel = new THREE.Vector3(g.position.x - ctx.head.x, 0, g.position.z - ctx.head.z).normalize();
    const fwd = new THREE.Vector3(ctx.forward.x, 0, ctx.forward.z);
    if (fwd.lengthSq() < 1e-4) return;
    fwd.normalize();
    if (toPanel.dot(fwd) < Math.cos(THREE.MathUtils.degToRad(25))) this.following = true;
    if (!this.following) return;
    // Ease toward the spot straight ahead rather than jumping; stop once there.
    const target = ctx.head.clone().addScaledVector(fwd, 0.7);
    target.y = ctx.head.y - 0.12;
    g.position.lerp(target, Math.min(1, ctx.dt * 4));
    g.lookAt(ctx.head);
    if (g.position.distanceTo(target) < 0.02) this.following = false;
  }
}
