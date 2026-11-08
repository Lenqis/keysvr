import * as THREE from 'three';
import type { KeyEvent } from '../hands/keyPress';
import { refineFromPresses, type KeyboardCalibration } from './keyboardFrame';
import { noteLabel, verifyTargets } from './keyboardModel';

/** Key travel of a typical synth key (m). */
const KEY_TRAVEL = 0.009;

export interface Status { text: string; color: string }

/**
 * Step 3 of calibration: the player presses two far-apart yellow keys. Where
 * the fingers really pressed them fixes the grid offset and key width
 * (two-point refinement); how deep they went tunes the key-top height.
 */
export class VerifyStep {
  idx = 0;
  heightTuned = false;
  private readonly xs: number[] = [];
  /** fingertip that pressed the current yellow key (only its release tunes height) */
  private tip: string | null = null;

  reset(keepHeight = false): void {
    this.idx = 0;
    if (!keepHeight) this.heightTuned = false;
  }

  get done(): boolean { return this.idx >= 2; }

  /** The key to press now. */
  target(cal: KeyboardCalibration): number {
    return verifyTargets(cal.range)[Math.min(this.idx, 1)];
  }

  /**
   * The finger stops at the bottom of the key travel: put the key tops one
   * travel above that, so later presses trigger mid-travel for this player.
   */
  onRelease(cal: KeyboardCalibration, e: KeyEvent): boolean {
    if (e.tipId !== this.tip || e.maxDepth === undefined) return false;
    this.tip = null;
    const maxDepth = e.maxDepth;
    cal.nudge.y = THREE.MathUtils.clamp(cal.nudge.y + (KEY_TRAVEL - maxDepth), -0.02, 0.02);
    cal.update();
    this.heightTuned = true;
    return true;
  }

  /** Handles a key-down; returns the status line to show, and whether the grid was rebuilt. */
  onPress(cal: KeyboardCalibration, e: KeyEvent): { status: Status; rebuilt: boolean } | null {
    if (this.done) return null;
    const target = cal.layout.keys.find((k) => k.midi === this.target(cal))!;
    const pressed = cal.layout.keys.find((k) => k.midi === e.midi)!;
    if (Math.abs(pressed.x - target.x) > cal.layout.pitch * 2.5 || e.x === undefined) {
      return { status: { text: `Нажато: ${noteLabel(e.midi)} — это далеко от жёлтой`, color: '#ff9b6b' }, rebuilt: false };
    }
    this.xs[this.idx++] = e.x;
    this.tip = e.tipId;
    if (this.idx === 1) {
      return { status: { text: 'Есть ✓ Теперь вторую жёлтую клавишу', color: '#ffd93d' }, rebuilt: false };
    }
    const [a, b] = verifyTargets(cal.range);
    const ok = refineFromPresses(cal, a, this.xs[0], b, this.xs[1]);
    if (!ok) this.idx = 0;
    return {
      status: ok
        ? { text: 'Сетка подстроена ✓ Жми «Готово»', color: '#8af59a' }
        : { text: 'Не вышло — нажми жёлтые ещё раз', color: '#ff9b6b' },
      rebuilt: ok,
    };
  }
}
