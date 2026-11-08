import type { Mic } from '../audio/mic';
import { PressChecker } from '../audio/pressChecker';
import type { Verdict } from '../audio/noteJudge';
import type { KeyboardCalibration } from './keyboardFrame';
import { noteNameRu } from './keyboardModel';

const GREEN = '#8af59a';
const ORANGE = '#ffb36b';
const GREY = '#a3a9c9';

/**
 * Key tester + microphone: after each hand press the mic checks which of the
 * nearby keys really sounded and fixes the key if the hand was off.
 * If the mic hears nothing, the hand result stays (decision "mode A").
 */
export class TesterMic {
  private checker: PressChecker | null = null;
  /** tipId → key the mic says is really held (differs from the hand's key) */
  readonly corrections = new Map<string, number>();
  private last: { verdict: Verdict | null } | null = null;

  /** emulator only: the fake synth sounds a note when the hand presses a key */
  static devPressHook: ((midi: number) => void) | null = null;

  constructor(private readonly mic: Mic) {}

  get stats() {
    return this.checker?.stats ?? { match: 0, corrected: 0, silent: 0 };
  }

  reset(cal: KeyboardCalibration): void {
    const lo = () => cal.range.lowestMidi;
    const hi = () => cal.range.lowestMidi + cal.range.keyCount - 1;
    this.checker = new PressChecker(this.mic, lo, hi);
    this.corrections.clear();
    this.last = null;
  }

  onPress(tipId: string, midi: number): void {
    this.corrections.delete(tipId);
    this.last = { verdict: null };
    TesterMic.devPressHook?.(midi);
    if (this.mic.state === 'on') this.checker?.onPress(tipId, midi);
  }

  onRelease(tipId: string): number | undefined {
    const m = this.corrections.get(tipId);
    this.corrections.delete(tipId);
    return m;
  }

  /** Verdicts that just arrived; corrected ones are recorded for held tips. */
  update(held: Map<string, number>): { tipId: string; verdict: Verdict }[] {
    if (!this.checker || this.mic.state !== 'on') return [];
    const done = this.checker.update();
    for (const d of done) {
      this.last = { verdict: d.verdict };
      if (d.verdict.kind === 'corrected' && held.get(d.tipId) === d.verdict.handMidi) {
        this.corrections.set(d.tipId, d.verdict.midi);
      }
    }
    return done;
  }

  /** Line under the note name: what hands and mic said about the last press. */
  verdictLine(): { text: string; color: string } {
    if (this.mic.state !== 'on') return { text: `Руки ✓ · ${this.offText()}`, color: GREEN };
    const v = this.last?.verdict;
    if (!v) return { text: 'Руки ✓ · микрофон слушает…', color: GREY };
    if (v.kind === 'match') return { text: 'Руки ✓ · Микрофон ✓', color: GREEN };
    if (v.kind === 'silent') return { text: 'Руки ✓ · микрофон не услышал', color: ORANGE };
    return { text: `Руки: ${noteNameRu(v.handMidi)} → микрофон: ${noteNameRu(v.midi)} (исправлено)`, color: ORANGE };
  }

  /** "Микрофон 12% · совпало 5 · исправлено 1 · не услышал 0" */
  statsLine(): string {
    if (this.mic.state !== 'on') return this.offText();
    const s = this.stats;
    const lvl = Math.min(99, Math.round(this.mic.level * 300));
    return `Микрофон ${lvl}% · совпало ${s.match} · исправлено ${s.corrected} · не услышал ${s.silent}`;
  }

  private offText(): string {
    switch (this.mic.state) {
      case 'denied': return 'микрофон запрещён в браузере';
      case 'error': return 'микрофон недоступен';
      case 'starting': return 'микрофон включается…';
      default: return 'микрофон выключен';
    }
  }
}
