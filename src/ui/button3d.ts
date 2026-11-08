import * as THREE from 'three';
import { CanvasPlane, centeredText, roundRect } from './canvasPlane';

export type ButtonState = 'idle' | 'hover' | 'pressed';

const STYLES: Record<ButtonState, { fill: string; text: string; glow: number }> = {
  idle: { fill: '#3dd6c6', text: '#06201d', glow: 0.0 },
  hover: { fill: '#7ff5ea', text: '#06201d', glow: 1.0 },
  pressed: { fill: '#1fa597', text: '#ffffff', glow: 0.6 },
};

const PRESS_DEPTH = 0.012; // how far the face sinks when pressed (m)

/**
 * A pushable 3D button. Its local +Z is the front; the front face sits at z = 0
 * when idle. Pointer logic (poke / ray) lives in ui/pointer.ts.
 */
export class Button3D {
  readonly group = new THREE.Group();
  readonly face: CanvasPlane;
  private readonly base: CanvasPlane;
  private state: ButtonState = 'idle';
  private label: string;
  onPress: (() => void) | null = null;

  constructor(label: string, readonly width = 0.2, readonly height = 0.075) {
    this.label = label;
    this.face = new CanvasPlane(width, height);
    this.face.mesh.position.z = 0.002;
    this.face.mesh.renderOrder = 3;
    // Dark pill slightly below the face: the face visibly sinks into it when pressed.
    this.base = new CanvasPlane(width, height);
    this.base.mesh.position.z = -0.011;
    this.base.mesh.renderOrder = 2;
    this.base.draw((ctx, w, h) => {
      const pad = h * 0.06;
      roundRect(ctx, pad, pad + h * 0.03, w - pad * 2, h - pad * 2, (h - pad * 2) / 2);
      ctx.fillStyle = '#0a2b27';
      ctx.fill();
    });
    this.group.add(this.base.mesh, this.face.mesh);
    this.redraw();
  }

  setLabel(label: string): void {
    this.label = label;
    this.redraw();
  }

  setState(state: ButtonState): void {
    if (state === this.state) return;
    this.state = state;
    this.face.mesh.position.z = state === 'pressed' ? 0.002 - PRESS_DEPTH : 0.002;
    this.redraw();
  }

  getState(): ButtonState { return this.state; }

  press(): void {
    this.onPress?.();
  }

  private redraw(): void {
    const s = STYLES[this.state];
    this.face.draw((ctx, w, h) => {
      const pad = h * 0.08;
      if (s.glow > 0) {
        ctx.shadowColor = 'rgba(127,245,234,0.9)';
        ctx.shadowBlur = pad * 1.5 * s.glow;
      }
      roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, (h - pad * 2) / 2);
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      centeredText(ctx, this.label, w / 2, h / 2 + h * 0.02, h * 0.46, s.text, 800);
    });
  }
}
