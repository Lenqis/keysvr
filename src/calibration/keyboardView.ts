import * as THREE from 'three';
import type { KeyboardCalibration } from './keyboardFrame';
import { noteLabel } from './keyboardModel';
import { CanvasPlane, centeredText, roundRect } from '../ui/canvasPlane';

const LIFT = 0.0015; // draw just above the key tops to avoid z-fighting with reality
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Translucent key grid drawn over the real keyboard: outlines for every key,
 * and a semi-opaque colored fill only on lit keys (normal blending, so colors
 * stay visible on white keys too).
 */
export class KeyboardView {
  readonly group = new THREE.Group();
  private fills: THREE.InstancedMesh | null = null;
  private outline: THREE.LineSegments | null = null;
  private readonly labels: CanvasPlane[] = [];
  private readonly colors = new Map<number, THREE.Color>();
  private index = new Map<number, number>();
  private baseMatrices: THREE.Matrix4[] = [];

  constructor(private readonly cal: KeyboardCalibration) {
    this.group.matrixAutoUpdate = false;
    this.rebuild();
  }

  /** Call after the key count / span changes. */
  rebuild(): void {
    if (this.fills) this.group.remove(this.fills);
    if (this.outline) this.group.remove(this.outline);
    const { keys } = this.cal.layout;
    this.fills = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }),
      keys.length,
    );
    this.fills.renderOrder = 2;
    this.fills.frustumCulled = false;
    const pts: number[] = [];
    const m = new THREE.Matrix4();
    this.index = new Map();
    this.baseMatrices = [];
    keys.forEach((k, i) => {
      this.index.set(k.midi, i);
      const len = k.zFront - k.zBack;
      const w = k.width;
      const y = k.top + LIFT;
      m.makeScale(w, 1, len).setPosition(k.x, y, (k.zFront + k.zBack) / 2);
      this.baseMatrices.push(m.clone());
      this.fills!.setMatrixAt(i, HIDDEN);
      this.fills!.setColorAt(i, new THREE.Color(0xffffff));
      const x0 = k.x - w / 2, x1 = k.x + w / 2;
      const rect = [[x0, k.zFront], [x1, k.zFront], [x1, k.zBack], [x0, k.zBack]];
      for (let j = 0; j < 4; j++) {
        const [ax, az] = rect[j], [bx, bz] = rect[(j + 1) % 4];
        pts.push(ax, y, az, bx, y, bz);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.outline = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x3dd6c6, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    this.outline.renderOrder = 2;
    this.outline.frustumCulled = false;
    this.group.add(this.fills, this.outline);
    this.colors.clear();
  }

  setOutlineOpacity(o: number): void {
    (this.outline!.material as THREE.LineBasicMaterial).opacity = o;
  }

  /** Light a key (null = back to idle). */
  setKeyColor(midi: number, color: THREE.ColorRepresentation | null): void {
    const i = this.index.get(midi);
    if (i === undefined) return;
    if (color === null) this.colors.delete(midi);
    else this.colors.set(midi, new THREE.Color(color));
    const c = this.colors.get(midi);
    this.fills!.setMatrixAt(i, c ? this.baseMatrices[i] : HIDDEN);
    if (c) this.fills!.setColorAt(i, c);
    this.fills!.instanceMatrix.needsUpdate = true;
    this.fills!.instanceColor!.needsUpdate = true;
  }

  clearColors(): void {
    for (const midi of [...this.colors.keys()]) this.setKeyColor(midi, null);
  }

  /** Floating note names over the given keys (pooled labels). */
  showLabels(notes: { midi: number; color: string }[]): void {
    while (this.labels.length < notes.length) {
      const l = new CanvasPlane(0.095, 0.04, 2000);
      l.mesh.renderOrder = 6;
      this.labels.push(l);
      this.group.add(l.mesh);
    }
    this.labels.forEach((l, i) => {
      const n = notes[i];
      l.mesh.visible = !!n;
      if (!n) return;
      const k = this.cal.layout.keys[this.index.get(n.midi) ?? 0];
      l.mesh.position.set(k.x, k.top + 0.05, k.zBack + 0.02);
      const key = `${n.midi}|${n.color}`;
      if (l.mesh.userData.key === key) return;
      l.mesh.userData.key = key;
      l.draw((ctx, w, h) => {
        roundRect(ctx, 4, 4, w - 8, h - 8, h * 0.3);
        ctx.fillStyle = 'rgba(13,16,32,0.9)';
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = n.color;
        ctx.stroke();
        centeredText(ctx, noteLabel(n.midi), w / 2, h / 2 + 2, h * 0.5, '#ffffff', 700);
      });
    });
  }

  /** Follow the calibration pose (anchor updates, nudges). Call every frame. */
  update(): void {
    this.group.matrix.copy(this.cal.matrix);
    this.group.matrixWorldNeedsUpdate = true;
  }

  /** World position of a point in keyboard-local coordinates. */
  localToWorld(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.cal.matrix);
  }
}
