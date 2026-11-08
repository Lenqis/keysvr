import * as THREE from 'three';
import { Button3D, type ButtonVariant } from './button3d';
import { CanvasPlane, FONT, centeredText, roundRect } from './canvasPlane';
import { PokeTarget, rayHits } from './pointer';

export interface ButtonSpec {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** relative width within its row (default 1) */
  grow?: number;
}

export interface Line { text: string; color?: string; size?: number; weight?: number }

export interface PanelContent {
  title: string;
  titleColor?: string;
  accent?: string;
  lines?: (string | Line)[];
  /** small keyboard sketch with a finger dot on the near edge of the end key */
  picture?: 'left' | 'right';
  /** rows of buttons, top to bottom */
  buttons?: ButtonSpec[][];
}

const W = 0.5;
const PAD = 0.02;
const TITLE_H = 0.05;
const LINE_H = 0.032;
const PICTURE_H = 0.085;
const ROW_H = 0.07;
const ROW_GAP = 0.014;

/** A floating panel: title, text lines and rows of finger-pokeable buttons. */
export class Panel {
  readonly group = new THREE.Group();
  private bg: CanvasPlane | null = null;
  private buttons: { btn: Button3D; poke: PokeTarget }[] = [];
  private content: PanelContent = { title: '' };
  private buttonKey = '';

  set(content: PanelContent): void {
    this.content = content;
    const lines = content.lines ?? [];
    const rows = content.buttons ?? [];
    const h = PAD * 2 + TITLE_H + lines.length * LINE_H + (content.picture ? PICTURE_H : 0) + (rows.length ? PAD : 0) + rows.length * (ROW_H + ROW_GAP);
    if (!this.bg || Math.abs(this.bg.heightM - h) > 1e-6) {
      if (this.bg) this.group.remove(this.bg.mesh);
      this.bg = new CanvasPlane(W, h, 2000);
      this.bg.mesh.renderOrder = 1;
      this.group.add(this.bg.mesh);
      this.buttonKey = '\u0000'; // panel resized → re-layout buttons (also when the new set is empty)
    }
    this.drawBackground(h);

    // Rebuild buttons only when their labels change (keeps hover/press state stable).
    const key = rows.map((r) => r.map((b) => `${b.label}|${b.variant ?? ''}|${b.grow ?? 1}`).join(',')).join(';');
    if (key !== this.buttonKey) {
      this.buttonKey = key;
      for (const b of this.buttons) this.group.remove(b.btn.group);
      this.buttons = [];
      let y = -h / 2 + PAD + ROW_H / 2 + (rows.length - 1) * (ROW_H + ROW_GAP);
      for (const row of rows) {
        const total = row.reduce((s, b) => s + (b.grow ?? 1), 0);
        const gap = 0.012;
        const usable = W - PAD * 2 - gap * (row.length - 1);
        let x = -W / 2 + PAD;
        for (const spec of row) {
          const bw = (usable * (spec.grow ?? 1)) / total;
          const btn = new Button3D(spec.label, bw, ROW_H, spec.variant ?? 'primary');
          btn.group.position.set(x + bw / 2, y, 0.012);
          this.group.add(btn.group);
          this.buttons.push({ btn, poke: new PokeTarget(btn) });
          x += bw + gap;
        }
        y -= ROW_H + ROW_GAP;
      }
    }
    // Always bind the latest callbacks.
    rows.flat().forEach((spec, i) => { this.buttons[i].btn.onPress = spec.onPress; });
  }

  /** Per-frame: fingertip pokes + ray hover. */
  update(tips: Map<string, THREE.Vector3>, rays: THREE.Object3D[], raycaster: THREE.Raycaster): void {
    if (!this.group.visible) return;
    // Snapshot: a press may rebuild the buttons; one press per frame at most.
    for (const { btn, poke } of [...this.buttons]) {
      const hover = rays.some((r) => rayHits(raycaster, r, btn.group) !== null);
      if (poke.update(tips, hover)) break;
    }
  }

  /** Controller trigger / hand pinch: press the button the ray points at. */
  select(ray: THREE.Object3D, raycaster: THREE.Raycaster): void {
    if (!this.group.visible) return;
    for (const { btn } of this.buttons) {
      if (rayHits(raycaster, ray, btn.group)) { btn.press(); return; }
    }
  }

  buttonByLabel(label: string): Button3D | undefined {
    return this.buttons.find((b) => b.btn.getLabel() === label)?.btn;
  }

  /** Face the head from `distance` ahead (horizontal), `drop` below eye level. */
  placeInFrontOf(head: THREE.Vector3, forward: THREE.Vector3, distance: number, drop: number): void {
    const flat = new THREE.Vector3(forward.x, 0, forward.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    this.group.position.copy(head).addScaledVector(flat, distance);
    this.group.position.y -= drop;
    this.group.lookAt(head);
  }

  private drawBackground(h: number): void {
    const c = this.content;
    this.bg!.draw((ctx, w, hp) => {
      const s = hp / h; // px per metre
      roundRect(ctx, 6, 6, w - 12, hp - 12, 0.022 * s);
      ctx.fillStyle = 'rgba(13,16,32,0.9)';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = c.accent ?? '#3dd6c6';
      ctx.stroke();
      let y = (PAD + TITLE_H / 2) * s;
      centeredText(ctx, c.title, w / 2, y, 0.037 * s, c.titleColor ?? '#f2f4ff', 800);
      y += (TITLE_H / 2 + LINE_H / 2) * s;
      for (const raw of c.lines ?? []) {
        const line = typeof raw === 'string' ? { text: raw } : raw;
        const size = (line.size ?? 0.023) * s;
        ctx.font = `${line.weight ?? 500} ${size}px ${FONT}`;
        fitText(ctx, line.text, w * 0.92, size, line.weight ?? 500);
        centeredText(ctx, line.text, w / 2, y, parseFloat(ctx.font.split(' ')[1]), line.color ?? '#d5d9f0', line.weight ?? 500);
        y += LINE_H * s;
      }
      if (c.picture) drawKeyboardSketch(ctx, w / 2, y - LINE_H * s * 0.3, PICTURE_H * s, c.picture);
    });
  }
}

/** Shrinks the font until the text fits `maxW`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: number): void {
  let px = size;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && px > size * 0.6) {
    px *= 0.95;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
}

/**
 * A mini keyboard seen from above (player at the bottom), the end key in
 * yellow and a finger dot on its near edge.
 */
function drawKeyboardSketch(ctx: CanvasRenderingContext2D, cx: number, top: number, h: number, side: 'left' | 'right'): void {
  const n = 14;
  const kh = h * 0.78;
  const kw = kh * 0.24;
  const x0 = cx - (n * kw) / 2;
  const y0 = top + h * 0.05;
  const end = side === 'left' ? 0 : n - 1;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === end ? '#ffd93d' : '#e9e9e4';
    ctx.fillRect(x0 + i * kw + 1, y0, kw - 2, kh);
  }
  const blackAfter = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]; // C# D# F# G# A# pattern
  ctx.fillStyle = '#15171c';
  for (const i of blackAfter) {
    if (i >= n - 1) continue;
    ctx.fillRect(x0 + (i + 1) * kw - kw * 0.3, y0, kw * 0.6, kh * 0.6);
  }
  // finger dot on the near (bottom) edge of the end key, with a "you" arrow
  const fx = x0 + end * kw + kw / 2;
  const fy = y0 + kh - kw * 0.45;
  ctx.beginPath();
  ctx.arc(fx, fy, kw * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6b6b';
  ctx.fill();
  ctx.lineWidth = kw * 0.12;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.font = `600 ${h * 0.16}px ${FONT}`;
  ctx.fillStyle = '#a3a9c9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('вид сверху · ты внизу', cx, y0 + kh + h * 0.03);
}
