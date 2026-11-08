import type { Onset } from './onsetTracker';

/** Hand press and mic onset belong together if this close in time (s)… */
export const MATCH_WINDOW = 0.35;
/** …and the hand's key is at most this many keys off. */
const MATCH_KEYS = 2;
/** A quick tap that ended before the mic answered stays lit this long (s). */
const MIN_SHOW = 0.3;
/** A mic-only note without a detected release goes dark after this (s). */
const MIC_MAX_SHOW = 3;

export type Shown =
  | { type: 'down'; id: string; midi: number; tipId: string | null; handMidi: number | null }
  | { type: 'up'; id: string; midi: number };

interface HandPress { tipId: string; midi: number; t: number; upAt: number | null }
interface Active { id: string; midi: number; tipId: string | null; until: number | null }

/**
 * Combines hand presses and mic note starts into the keys to show.
 * Mic on: a key lights only when the mic heard it (with the finger from a matching hand
 * press, or alone); hand presses without sound are ignored. Mic off: hands only.
 */
export class PressFusion {
  micOn = true;
  readonly stats = { match: 0, corrected: 0, micOnly: 0, handOnly: 0 };
  private hands: HandPress[] = [];
  private mics: Onset[] = [];
  private active: Active[] = [];
  private seq = 0;

  /** Switches mic use; everything shown is released. */
  setMic(on: boolean): Shown[] {
    this.micOn = on;
    this.hands = [];
    this.mics = [];
    return [...this.active].flatMap((a) => this.release(a));
  }

  handDown(tipId: string, midi: number, t: number): Shown[] {
    if (!this.micOn) {
      this.active.push({ id: tipId, midi, tipId, until: null });
      return [{ type: 'down', id: tipId, midi, tipId, handMidi: midi }];
    }
    this.hands.push({ tipId, midi, t, upAt: null });
    return this.match(t);
  }

  handUp(tipId: string, t: number): Shown[] {
    const pending = this.hands.find((h) => h.tipId === tipId && h.upAt === null);
    if (pending) pending.upAt = t;
    const a = this.active.find((x) => x.tipId === tipId && x.until === null);
    if (!a) return [];
    return this.release(a);
  }

  micOnset(o: Onset): Shown[] {
    if (!this.micOn) return [];
    this.mics.push(o);
    return this.match(o.t);
  }

  micRelease(midi: number): Shown[] {
    const a = this.active.find((x) => x.tipId === null && x.midi === midi);
    return a ? this.release(a) : [];
  }

  /** Time-outs: unmatched mic notes are shown alone, unmatched hand presses dropped. */
  update(t: number): Shown[] {
    const out: Shown[] = [];
    for (const o of this.mics.filter((m) => t - m.t > MATCH_WINDOW)) {
      const id = `mic-${this.seq++}`;
      this.stats.micOnly++;
      this.active.push({ id, midi: o.midi, tipId: null, until: o.t + MIC_MAX_SHOW });
      out.push({ type: 'down', id, midi: o.midi, tipId: null, handMidi: null });
    }
    this.mics = this.mics.filter((m) => t - m.t <= MATCH_WINDOW);
    const stale = this.hands.filter((h) => t - h.t > MATCH_WINDOW);
    this.stats.handOnly += stale.length;
    this.hands = this.hands.filter((h) => t - h.t <= MATCH_WINDOW);
    for (const a of [...this.active]) if (a.until !== null && t >= a.until) out.push(...this.release(a));
    return out;
  }

  /** Keys shown now (id → midi, finger). */
  shown(): readonly Active[] {
    return this.active;
  }

  private match(t: number): Shown[] {
    const out: Shown[] = [];
    for (;;) {
      let best: { h: HandPress; o: Onset; score: number } | null = null;
      for (const h of this.hands) {
        for (const o of this.mics) {
          const dk = Math.abs(h.midi - o.midi);
          const dt = Math.abs(h.t - o.t);
          if (dk > MATCH_KEYS || dt > MATCH_WINDOW) continue;
          const score = dk + dt;
          if (!best || score < best.score) best = { h, o, score };
        }
      }
      if (!best) return out;
      const { h, o } = best;
      this.hands = this.hands.filter((x) => x !== h);
      this.mics = this.mics.filter((x) => x !== o);
      if (h.midi === o.midi) this.stats.match++;
      else this.stats.corrected++;
      // Same finger may still show an older note: replace it.
      for (const a of this.active.filter((x) => x.tipId === h.tipId)) out.push(...this.release(a));
      this.active.push({ id: h.tipId, midi: o.midi, tipId: h.tipId, until: h.upAt === null ? null : t + MIN_SHOW });
      out.push({ type: 'down', id: h.tipId, midi: o.midi, tipId: h.tipId, handMidi: h.midi });
    }
  }

  private release(a: Active): Shown[] {
    this.active = this.active.filter((x) => x !== a);
    return [{ type: 'up', id: a.id, midi: a.midi }];
  }
}
