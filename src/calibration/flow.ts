import * as THREE from 'three';
import { FINGER_COLORS, type Finger } from '../hands/handView';
import { KeyPressDetector, type KeyEvent } from '../hands/keyPress';
import type { Panel } from '../ui/panel';
import { HoldCapture } from './holdCapture';
import { KeyboardCalibration, frameFromPoints, plausiblePitch } from './keyboardFrame';
import { DEFAULT_PRESET, MIDDLE_C, nextPreset, noteLabel, type KeyRange } from './keyboardModel';
import { KeyboardView } from './keyboardView';
import { anchorMatrix, loadSaved, restoreAnchor, saveCalibration, savedMatrix } from './storage';

export type Step = 'start' | 'restoring' | 'confirmSaved' | 'touchLeft' | 'touchRight' | 'verify' | 'tester';

export interface FrameCtx {
  dt: number;
  tips: Map<string, THREE.Vector3>;
  head: THREE.Vector3;
  forward: THREE.Vector3;
  frame: XRFrame | null;
  refSpace: XRReferenceSpace | null;
}

const NUDGE = 0.003;
const YELLOW = '#ffd93d';
const fingerOf = (tipId: string) => tipId.split('-')[1] as Finger;
const fingerHex = (tipId: string) => `#${FINGER_COLORS[fingerOf(tipId)].toString(16).padStart(6, '0')}`;

/** Calibration wizard (touch left → touch right → verify) and the key tester. */
export class CalibrationFlow {
  step: Step = 'start';
  cal: KeyboardCalibration | null = null;
  private view: KeyboardView | null = null;
  private detector: KeyPressDetector | null = null;
  readonly capture = new HoldCapture();
  private readonly ring: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  left: THREE.Vector3 | null = null;
  private range: KeyRange = DEFAULT_PRESET;
  private anchor: XRAnchor | null = null;
  private status = '';
  private statusColor = '#d5d9f0';
  private lastNote: { midi: number; color: string } | null = null;
  private placed = false;
  private following = false;
  private restoreTimer = 0;

  constructor(private readonly scene: THREE.Scene, private readonly panel: Panel) {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.014, 0.019, 40),
      new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ring.renderOrder = 8;
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 16, 12),
      new THREE.MeshBasicMaterial({ color: YELLOW, depthTest: false }),
    );
    this.marker.renderOrder = 8;
    this.ring.visible = this.marker.visible = false;
    scene.add(this.ring, this.marker);
  }

  /** Called at session start. */
  begin(session: XRSession): void {
    this.placed = false;
    const saved = loadSaved();
    if (!saved) return this.go('touchLeft');
    this.range = saved.range;
    this.setCalibration(new KeyboardCalibration(savedMatrix(saved), saved.span, saved.range));
    this.cal!.nudge = { ...saved.nudge };
    this.cal!.update();
    this.go('restoring');
    this.restoreTimer = 0;
    void restoreAnchor(session, saved).then((a) => { this.anchor = a; });
  }

  update(ctx: FrameCtx): void {
    if (this.anchor && ctx.frame && ctx.refSpace && this.cal) {
      const m = anchorMatrix(ctx.frame, this.anchor, ctx.refSpace);
      if (m) this.cal.setBase(m);
    }
    this.view?.update();
    this.ring.visible = false;

    switch (this.step) {
      case 'restoring':
        this.restoreTimer += ctx.dt;
        // Wait briefly for the anchor; without one, fall back to the saved pose.
        if (this.restoreTimer > (this.anchor ? 0.3 : 3)) this.go('confirmSaved');
        break;
      case 'touchLeft':
      case 'touchRight':
        this.updateTouch(ctx);
        break;
      case 'verify':
      case 'tester':
        this.handleKeys(this.detector!.update(ctx.tips));
        break;
    }
    if (ctx.head.y > 0.3) {
      if (!this.placed) this.placePanel(ctx);
      else if (!this.cal) this.followGaze(ctx);
    }
  }

  private updateTouch(ctx: FrameCtx): void {
    const left = this.left;
    // Only index fingertips can mark a point (curling other fingers looks like a descent).
    const index = new Map([...ctx.tips].filter(([id]) => id.endsWith('-index')));
    const p = this.capture.update(index, ctx.dt, (pt) =>
      pt.y < ctx.head.y - 0.15 && pt.y > ctx.head.y - 1.3 &&
      // The right end must be level with the left one and a keyboard-width away.
      (!left || (Math.abs(pt.y - left.y) < 0.06 && pt.distanceTo(left) > 0.3 && pt.distanceTo(left) < 1.7)));
    if (this.capture.progress > 0.05) {
      this.ring.visible = true;
      this.ring.position.copy(this.capture.at);
      this.ring.lookAt(ctx.head);
      this.ring.geometry.dispose();
      this.ring.geometry = new THREE.RingGeometry(0.014, 0.019, 40, 1, Math.PI / 2, -Math.PI * 2 * this.capture.progress);
    }
    if (!p) return;
    if (this.step === 'touchLeft') {
      this.left = p;
      this.marker.position.copy(p);
      this.marker.visible = true;
      this.go('touchRight');
    } else {
      const { base, span } = frameFromPoints(this.left!, p);
      this.marker.visible = false;
      this.setCalibration(new KeyboardCalibration(base, span, this.range));
      this.placed = false; // move the panel above the keyboard
      this.go('verify');
    }
  }

  private handleKeys(events: KeyEvent[]): void {
    const view = this.view!;
    for (const e of events) {
      if (e.type === 'up') {
        view.setKeyColor(e.midi, this.step === 'verify' && e.midi === this.target() ? YELLOW : null);
        continue;
      }
      const color = fingerHex(e.tipId);
      view.setKeyColor(e.midi, color);
      this.lastNote = { midi: e.midi, color };
      if (this.step === 'verify') this.onVerifyPress(e);
    }
    const held = [...this.detector!.held()].map(([tip, midi]) => ({ midi, color: fingerHex(tip) }));
    view.showLabels(held);
    if (events.some((e) => e.type === 'down')) this.render();
  }

  /** The key to press in the verify step: middle C, or the middle key if out of range. */
  private target(): number {
    const r = this.cal!.range;
    const inRange = MIDDLE_C >= r.lowestMidi && MIDDLE_C < r.lowestMidi + r.keyCount;
    return inRange ? MIDDLE_C : r.lowestMidi + Math.floor(r.keyCount / 2);
  }

  /** Auto-centres the grid on where the target key was actually pressed. */
  private onVerifyPress(e: KeyEvent): void {
    const cal = this.cal!;
    const target = cal.layout.keys.find((k) => k.midi === this.target())!;
    const pressed = cal.layout.keys.find((k) => k.midi === e.midi)!;
    const offKeys = Math.round((pressed.x - target.x) / cal.layout.pitch);
    if (Math.abs(offKeys) > 2) {
      this.status = `Нажато: ${noteLabel(e.midi)} — далеко. Проверь число клавиш`;
      this.statusColor = '#ff9b6b';
      return;
    }
    // Shift the grid so the target key sits where the finger pressed.
    cal.nudge.x += pressed.x - target.x;
    cal.update();
    this.view!.clearColors();
    this.view!.setKeyColor(target.midi, YELLOW);
    this.status = offKeys === 0 ? 'Совпало ✓ Жми «Готово»' : `Сетка сдвинута на ${Math.abs(offKeys)} клав. Нажми жёлтую ещё раз`;
    this.statusColor = offKeys === 0 ? '#8af59a' : '#ffd93d';
  }

  private setCalibration(cal: KeyboardCalibration): void {
    if (this.view) this.scene.remove(this.view.group);
    this.cal = cal;
    this.view = new KeyboardView(cal);
    this.detector = new KeyPressDetector(cal);
    this.scene.add(this.view.group);
  }

  private go(step: Step): void {
    this.step = step;
    this.status = '';
    this.capture.reset();
    if (step === 'touchLeft') {
      this.left = null;
      this.anchor = null;
      if (this.view) this.scene.remove(this.view.group);
      this.view = null;
      this.cal = null;
      this.placed = false;
    }
    if (this.view) {
      this.view.group.visible = step !== 'restoring';
      this.view.clearColors();
      this.view.setOutlineOpacity(step === 'tester' ? 0.3 : 0.6);
      if (step === 'verify') {
        this.view.setKeyColor(this.target(), YELLOW);
        if (!plausiblePitch(this.cal!.layout)) {
          this.status = `Клавиши ${(this.cal!.layout.pitch * 1000).toFixed(0)} мм — проверь число клавиш`;
          this.statusColor = '#ff9b6b';
        }
      }
    }
    this.render();
  }

  private placePanel(ctx: FrameCtx): void {
    this.placed = true;
    if (this.cal && this.view) {
      const L = this.cal.layout;
      const pos = this.view.localToWorld(this.cal.span / 2, 0.27, -L.whiteLength - 0.02);
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
  private followGaze(ctx: FrameCtx): void {
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

  /** Redraws the panel for the current step. */
  render(): void {
    const p = this.panel;
    const status = { text: this.status || ' ', color: this.statusColor, weight: 700 };
    switch (this.step) {
      case 'start':
      case 'restoring':
        p.set({ title: 'Загрузка калибровки…', lines: [] });
        break;
      case 'confirmSaved':
        p.set({
          title: 'Синтезатор на месте?',
          lines: ['Голубая сетка должна лежать точно на клавишах', 'Если съехала — откалибруй заново'],
          buttons: [[
            { label: 'Заново', variant: 'secondary', onPress: () => this.go('touchLeft') },
            { label: 'Всё верно', onPress: () => this.go('tester') },
          ]],
        });
        break;
      case 'touchLeft':
        p.set({
          title: 'Шаг 1 из 3',
          lines: ['Коснись указательным пальцем', { text: 'переднего края самой ЛЕВОЙ клавиши', weight: 700, color: '#ffffff' }, 'и подержи палец 1 секунду'],
        });
        break;
      case 'touchRight':
        p.set({
          title: 'Шаг 2 из 3',
          lines: ['Теперь коснись', { text: 'переднего края самой ПРАВОЙ клавиши', weight: 700, color: '#ffffff' }, 'и подержи палец 1 секунду'],
          buttons: [[{ label: 'Назад', variant: 'secondary', onPress: () => this.go('touchLeft') }]],
        });
        break;
      case 'verify': {
        const n = this.cal!.range.keyCount;
        p.set({
          title: 'Шаг 3 из 3 · проверка',
          lines: [`Нажми жёлтую клавишу — ${noteLabel(this.target())}`, status],
          buttons: [
            [
              { label: '◀', variant: 'secondary', onPress: () => this.nudge(-NUDGE) },
              { label: '▶', variant: 'secondary', onPress: () => this.nudge(NUDGE) },
              { label: `Клавиш: ${n}`, variant: 'secondary', grow: 2, onPress: () => this.cycleKeys() },
            ],
            [
              { label: 'Заново', variant: 'secondary', onPress: () => this.go('touchLeft') },
              { label: 'Готово ✓', onPress: () => void this.finish() },
            ],
          ],
        });
        break;
      }
      case 'tester': {
        const note = this.lastNote;
        p.set({
          title: 'Тестер клавиш',
          lines: [
            note ? { text: noteLabel(note.midi), color: note.color, size: 0.03, weight: 800 } : 'Нажимай любые клавиши',
            note ? { text: 'Руки ✓   Микрофон — на следующем этапе', color: '#8af59a' } : ' ',
          ],
          buttons: [[{ label: 'Калибровка', variant: 'secondary', onPress: () => this.go('touchLeft') }]],
        });
        break;
      }
    }
  }

  private nudge(dx: number): void {
    this.cal!.nudge.x += dx;
    this.cal!.update();
  }

  private cycleKeys(): void {
    const cal = this.cal!;
    let next = nextPreset(cal.range, 1);
    if (next.keyCount === cal.range.keyCount) next = nextPreset({ keyCount: 25, lowestMidi: 48 }, -1);
    this.range = next;
    cal.setRange(next);
    this.view!.rebuild();
    this.detector = new KeyPressDetector(cal);
    this.go('verify');
  }

  /** frame/refSpace come from the app at press time. */
  frameSource: (() => { frame: XRFrame | null; refSpace: XRReferenceSpace | null }) | null = null;

  private async finish(): Promise<void> {
    const src = this.frameSource?.() ?? { frame: null, refSpace: null };
    this.go('tester');
    await saveCalibration(this.cal!, src.frame, src.refSpace);
  }
}
