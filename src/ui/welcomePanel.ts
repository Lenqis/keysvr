import * as THREE from 'three';
import { Button3D } from './button3d';
import { CanvasPlane, centeredText, roundRect } from './canvasPlane';

const W = 0.42;
const H = 0.22;

type Mode = 'welcome' | 'done';

/** Stage-0 panel: title, one-line instruction and the "Начало" button. */
export class WelcomePanel {
  readonly group = new THREE.Group();
  readonly button = new Button3D('Начало');
  private readonly bg = new CanvasPlane(W, H, 2000);
  private mode: Mode = 'welcome';

  constructor() {
    this.bg.mesh.renderOrder = 1;
    this.button.group.position.set(0, -0.045, 0.012);
    this.group.add(this.bg.mesh, this.button.group);
    this.button.onPress = () => this.setMode(this.mode === 'welcome' ? 'done' : 'welcome');
    this.redraw();
  }

  getMode(): Mode { return this.mode; }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.button.setLabel(mode === 'welcome' ? 'Начало' : 'Ещё раз');
    this.redraw();
  }

  /** Put the panel in front of the head at a comfortable poke distance, facing the user. */
  placeInFrontOf(head: THREE.Vector3, forward: THREE.Vector3, distance = 0.45, drop = 0.22): void {
    const flat = new THREE.Vector3(forward.x, 0, forward.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    this.group.position.copy(head).addScaledVector(flat, distance);
    this.group.position.y -= drop;
    this.group.lookAt(head);
  }

  private redraw(): void {
    const done = this.mode === 'done';
    this.bg.draw((ctx, w, h) => {
      const r = h * 0.09;
      roundRect(ctx, 6, 6, w - 12, h - 12, r);
      ctx.fillStyle = 'rgba(13,16,32,0.88)';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = done ? '#6bcb77' : '#3dd6c6';
      ctx.stroke();
      if (done) {
        centeredText(ctx, 'Всё работает ✓', w / 2, h * 0.17, h * 0.13, '#8af59a', 800);
        centeredText(ctx, 'Следующий этап — калибровка', w / 2, h * 0.34, h * 0.088, '#d5d9f0', 500);
      } else {
        centeredText(ctx, 'KeysVR', w / 2, h * 0.17, h * 0.15, '#f2f4ff', 800);
        centeredText(ctx, 'Нажми кнопку пальцем', w / 2, h * 0.34, h * 0.088, '#d5d9f0', 500);
      }
    });
  }
}
