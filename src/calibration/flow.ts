import * as THREE from 'three';
import { FINGER_COLORS, type Finger } from '../hands/handView';
import { KeyPressDetector, SENSITIVITY, type KeyEvent, type Sensitivity } from '../hands/keyPress';
import type { Panel } from '../ui/panel';
import { panelFor } from './flowPanels';
import { HoldCapture, inGaze } from './holdCapture';
import { KeyboardCalibration, frameFromPoints, plausiblePitch } from './keyboardFrame';
import { DEFAULT_PRESET, nextPreset, noteLabel, type KeyRange } from './keyboardModel';
import { PanelPlacement } from './panelPlacement';
import { VerifyStep } from './verifyStep';
import { KeyboardView } from './keyboardView';
import { anchorMatrix, loadSaved, restoreAnchor, saveCalibration, savedMatrix } from './storage';

export type { Step } from './flowPanels';
import type { Step } from './flowPanels';

export interface FrameCtx {
  dt: number;
  tips: Map<string, THREE.Vector3>;
  /** lightly smoothed fingertips for key-press detection */
  pressTips: Map<string, THREE.Vector3>;
  head: THREE.Vector3;
  forward: THREE.Vector3;
  frame: XRFrame | null;
  refSpace: XRReferenceSpace | null;
}

const NUDGE = 0.003;
const SENS_KEY = 'keysvr.sensitivity';
const SENS_ORDER: Sensitivity[] = ['low', 'mid', 'high'];

const YELLOW = '#ffd93d';
const fingerOf = (tipId: string) => tipId.split('-')[1] as Finger;
const fingerHex = (tipId: string) => `#${FINGER_COLORS[fingerOf(tipId)].toString(16).padStart(6, '0')}`;

/** Calibration wizard (touch left → touch right → verify) and the key tester. */
export class CalibrationFlow {
  step: Step = 'start';
  cal: KeyboardCalibration | null = null;
  private view: KeyboardView | null = null;
  detector: KeyPressDetector | null = null;
  readonly capture = new HoldCapture();
  private readonly ring: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  left: THREE.Vector3 | null = null;
  private range: KeyRange = DEFAULT_PRESET;
  private anchor: XRAnchor | null = null;
  status = '';
  private statusColor = '#d5d9f0';
  private lastNote: { midi: number; color: string } | null = null;
  private placed = false;
  private restoreTimer = 0;
  readonly verify = new VerifyStep();
  private readonly placement: PanelPlacement;
  private sensitivity: Sensitivity = (localStorage.getItem(SENS_KEY) as Sensitivity | null) ?? 'mid';
  private readoutTimer = 0;

  constructor(private readonly scene: THREE.Scene, private readonly panel: Panel) {
    this.placement = new PanelPlacement(panel);
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
        this.handleKeys(this.detector!.update(ctx.pressTips, ctx.dt));
        // Live finger depth readout (helps tune sensitivity), 5 times a second.
        if (this.step === 'tester' && (this.readoutTimer += ctx.dt) > 0.2) {
          this.readoutTimer = 0;
          this.render();
        }
        break;
    }
    if (ctx.head.y > 0.3) {
      if (!this.placed) {
        this.placed = true;
        this.placement.place(ctx, this.cal);
      } else if (!this.cal) this.placement.follow(ctx);
    }
  }

  private updateTouch(ctx: FrameCtx): void {
    const left = this.left;
    // Only index fingertips can mark a point (curling other fingers looks like a descent).
    const index = new Map([...ctx.tips].filter(([id]) => id.endsWith('-index')));
    const p = this.capture.update(index, ctx.dt, (pt) =>
      pt.y < ctx.head.y - 0.15 && pt.y > ctx.head.y - 1.3 &&
      // Only the finger the player is looking at (not a hand resting elsewhere).
      inGaze(ctx.head, ctx.forward, pt, 22) &&
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
        const stillTarget = this.step === 'verify' && !this.verify.done && e.midi === this.verify.target(this.cal!);
        view.setKeyColor(e.midi, stillTarget ? YELLOW : null);
        if (this.step === 'verify' && this.verify.onRelease(this.cal!, e)) this.render();
        continue;
      }
      const color = fingerHex(e.tipId);
      view.setKeyColor(e.midi, color);
      this.lastNote = { midi: e.midi, color };
      if (this.step === 'verify') this.onVerifyPress(e);
    }
    const held = [...this.detector!.held()].map(([tipId, midi]) => ({ tipId, midi, color: fingerHex(tipId) }));
    view.showLabels(held);
    if (events.some((e) => e.type === 'down')) this.render();
  }

  /** Held notes (for tests/debug). */
  heldNotes(): number[] {
    return [...(this.detector?.held().values() ?? [])];
  }

  private onVerifyPress(e: KeyEvent): void {
    const r = this.verify.onPress(this.cal!, e);
    if (!r) return;
    this.status = r.status.text;
    this.statusColor = r.status.color;
    if (r.rebuilt) this.view!.rebuild();
    this.view!.clearColors();
    if (!this.verify.done) this.view!.setKeyColor(this.verify.target(this.cal!), YELLOW);
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
      this.verify.reset();
    }
    // Verify: catch even shallow presses (height not tuned yet); later: chosen sensitivity.
    if (this.detector) {
      this.detector.setSensitivity(this.sensitivity);
      if (step === 'verify') this.detector.pressDepth = 0;
    }
    if (step === 'verify') this.verify.reset(true);
    if (this.view) {
      this.view.group.visible = step !== 'restoring';
      this.view.clearColors();
      this.view.setOutlineOpacity(step === 'tester' ? 0.3 : 0.6);
      if (step === 'verify') {
        this.view.setKeyColor(this.verify.target(this.cal!), YELLOW);
        if (!plausiblePitch(this.cal!.layout)) {
          this.status = `Клавиши ${(this.cal!.layout.pitch * 1000).toFixed(0)} мм — проверь число клавиш`;
          this.statusColor = '#ff9b6b';
        }
      }
    }
    this.render();
  }

  /** Redraws the panel for the current step. */
  render(): void {
    this.panel.set(panelFor({
      step: this.step,
      status: this.status,
      statusColor: this.statusColor,
      keyCount: this.cal?.range.keyCount ?? 0,
      verifyIdx: this.verify.idx,
      target: this.cal ? noteLabel(this.verify.target(this.cal)) : '',
      heightTuned: this.verify.heightTuned,
      lastNote: this.lastNote,
      depthText: this.depthReadout(),
      sensLabel: SENSITIVITY[this.sensitivity].label,
    }, {
      recalibrate: () => this.go('touchLeft'),
      confirm: () => this.go('tester'),
      nudge: (dx) => this.nudge(dx * NUDGE),
      cycleKeys: () => this.cycleKeys(),
      finish: () => void this.finish(),
      cycleSensitivity: () => this.cycleSensitivity(),
    }));
  }

  /** "Палец ниже верха клавиши: 3 мм · порог 4 мм" — for tuning and bug reports. */
  private depthReadout(): string {
    const d = this.detector?.deepest ?? null;
    const thr = Math.round(SENSITIVITY[this.sensitivity].press * 1000);
    if (d === null) return `Порог нажатия: ${thr} мм`;
    const mm = Math.round(d * 1000);
    return `Палец ${mm >= 0 ? 'ниже' : 'выше'} верха клавиши: ${Math.abs(mm)} мм · порог ${thr} мм`;
  }

  private cycleSensitivity(): void {
    this.sensitivity = SENS_ORDER[(SENS_ORDER.indexOf(this.sensitivity) + 1) % SENS_ORDER.length];
    localStorage.setItem(SENS_KEY, this.sensitivity);
    this.detector?.setSensitivity(this.sensitivity);
    this.render();
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
