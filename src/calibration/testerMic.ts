import type { Mic } from '../audio/mic';
import { MicKeys } from '../audio/micKeys';
import { PressFusion, type Shown } from '../audio/fusion';
import type { KeyEvent } from '../hands/keyPress';
import type { KeyboardCalibration } from './keyboardFrame';
import { noteNameRu, noteLabel } from './keyboardModel';

const GREEN = '#8af59a';
const ORANGE = '#ffb36b';
const GREY = '#a3a9c9';
const USE_KEY = 'keysvr.useMic';

/**
 * Key tester with the microphone: the mic listens to every key all the time and
 * decides which key sounded; the hands only tell which finger pressed it.
 * Without a working mic (or switched off) the hands alone decide.
 */
export class TesterMic {
  /** emulator only: the fake synth sounds a note when the hand presses a key */
  static devPressHook: ((midi: number) => void) | null = null;
  readonly fusion = new PressFusion();
  private keys: MicKeys | null = null;
  private range: [number, number] = [36, 96];
  /** keys with a fingertip just above them during the last 3 s (audio-clock time) */
  private hover: { t: number; midi: number }[] = [];
  /** mic notes ignored because no finger was near that key (room noise, voices) */
  noise = 0;
  private last: Shown | null = null;
  useMic = localStorage.getItem(USE_KEY) !== 'off';

  constructor(private readonly mic: Mic) {
    this.fusion.guide = (midi, t) => this.keys?.riseNear(midi, t) ?? null;
  }

  /** Only sounds where a finger is (±2 keys, ±0.5 s) can be the synth being played. */
  private nearFinger(midi: number, t: number): boolean {
    return this.hover.some((h) => Math.abs(h.midi - midi) <= 2 && Math.abs(h.t - t) <= 0.5);
  }

  get stats() {
    return { ...this.fusion.stats, noise: this.noise };
  }

  private get listening(): boolean {
    return this.useMic && this.mic.state === 'on';
  }

  reset(cal: KeyboardCalibration): void {
    const lo = cal.range.lowestMidi;
    this.range = [lo, lo + cal.range.keyCount - 1];
    this.keys = null;
    this.fusion.setMic(this.listening);
    this.last = null;
  }

  toggle(): Shown[] {
    this.useMic = !this.useMic;
    localStorage.setItem(USE_KEY, this.useMic ? 'on' : 'off');
    return this.fusion.setMic(this.listening);
  }

  /** Hand events + mic analysis → keys to light / unlight. */
  update(events: KeyEvent[], hovering: number[]): Shown[] {
    if (this.fusion.micOn !== this.listening) this.fusion.setMic(this.listening);
    const t = this.mic.now / this.mic.sampleRate;
    const out: Shown[] = [];
    for (const midi of new Set(hovering)) this.hover.push({ t, midi });
    this.hover = this.hover.filter((h) => t - h.t <= 3); // checked up to ~1 s late on slow frames
    for (const e of events) {
      if (e.type === 'down') {
        TesterMic.devPressHook?.(e.midi);
        out.push(...this.fusion.handDown(e.tipId, e.midi, t));
      } else out.push(...this.fusion.handUp(e.tipId, t));
    }
    if (this.listening && !this.keys) this.keys = new MicKeys(this.mic, ...this.range);
    if (this.listening && this.keys) {
      const r = this.keys.update();
      for (const o of r.onsets) {
        if (this.nearFinger(o.midi, o.t)) out.push(...this.fusion.micOnset(o));
        else this.noise++;
      }
      for (const m of r.releases) out.push(...this.fusion.micRelease(m));
      out.push(...this.fusion.update(this.keys.time));
    }
    for (const s of out) if (s.type === 'down') this.last = s;
    return out;
  }

  panelView() {
    return { verdict: this.verdictLine(), hear: this.hearLine(), stats: this.statsLine(), button: this.micButton() };
  }

  /** Line under the note name: who detected the last key. */
  verdictLine(): { text: string; color: string } {
    const s = this.last;
    if (!this.listening) return { text: `Только руки · ${this.offText()}`, color: GREY };
    if (!s || s.type !== 'down') return { text: 'Нажимай клавиши — микрофон слушает', color: GREY };
    if (s.tipId === null) return { text: 'Микрофон ✓ · руки не увидели нажатие', color: ORANGE };
    if (s.handMidi === s.midi) return { text: 'Руки ✓ · Микрофон ✓', color: GREEN };
    return { text: `Руки: ${noteNameRu(s.handMidi!)} → микрофон: ${noteNameRu(s.midi)} (исправлено)`, color: ORANGE };
  }

  /** What the mic hears right now — shows at a glance whether it works at all. */
  hearLine(): string {
    if (this.mic.state !== 'on') return this.offText();
    const l = this.keys?.loudest;
    const lvl = Math.min(99, Math.round(this.mic.level * 300));
    return l ? `Слышу: ${noteLabel(l.midi)} · громкость ${lvl}%` : `Слышу: тишина · громкость ${lvl}%`;
  }

  /** "совпало 5 · исправлено 1 · только микрофон 2 · руки без звука 3" */
  statsLine(): string {
    if (!this.listening) return ' ';
    const s = this.stats;
    return `совпало ${s.match} · испр. ${s.corrected} · только микр. ${s.micOnly} · руки без звука ${s.handOnly} · шум ${this.noise}`;
  }

  micButton(): string {
    if (this.mic.state !== 'on') return 'Микр.: нет';
    return this.useMic ? 'Микр.: вкл' : 'Микр.: выкл';
  }

  private offText(): string {
    switch (this.mic.state) {
      case 'denied': return 'микрофон запрещён в браузере';
      case 'error': return 'микрофон недоступен';
      case 'starting': return 'микрофон включается…';
      case 'on': return 'микрофон выключен кнопкой';
      default: return 'микрофон не включён на стартовой странице';
    }
  }
}
