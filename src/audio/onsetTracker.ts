/** A key that started sounding. t = audio-clock seconds when it was first noticed. */
export interface Onset { midi: number; t: number; db: number }

/** Rise over the recent minimum that counts as a new note (dB). */
const RISE = 10;
/** …and it must stand this far above the key's own noise floor (dB). */
const ABOVE_FLOOR = 15;
/** Candidates are held this long so slower (low, long-window) keys can show up for comparison. */
export const SETTLE = 0.12;
/** Same key can't start again sooner than this (s). */
const REFRACTORY = 0.25;
/** A louder neighbour (±2 keys) within this many dB explains a candidate as spectral leakage. */
const NEIGHBOUR_DB = 3;
/** Octave/twelfth/double-octave above a sounding note: its own harmonics, unless clearly louder. */
const HARMONIC_STEPS = [12, 19, 24, 28, 31, 34, 36]; // harmonics 2…8
const HARMONIC_DB = 9;
/** Released when this far below its peak, or close to the floor. */
const RELEASE_DROP = 20;
const RELEASE_FLOOR = 8;
const FLOOR_RISE_PER_S = 3;
/** Share of settle frames in which a candidate must look like a steady note. */
const STEADY = 0.75;
/** Hand-guided search: a smaller rise is enough where a finger just pressed (dB). */
const GUIDED_RISE = 6;
/** The fundamental must carry at least this share of the note (dB below the harmonic sum). */
const FUND_MIN = 13;
/** Candidates far below the loudest key in the frame are side-lobe noise (dB). */
const BELOW_MAX = 30;
/** Broadband sounds (knocks, steps, rustle) raise all keys alike; a note stands out of the median (dB). */
const ABOVE_MEDIAN = 12;

interface KeyState {
  /** last second: loudness and whether it looked like a note (own fundamental, local peak) */
  hist: { t: number; db: number; tonal: boolean }[];
  floor: number;
  on: boolean;
  peak: number;
  lastOnset: number;
}

interface Cand extends Onset { peak: number; dropped: boolean; final: boolean; seen: number; tonal: number }

/**
 * Finds note starts in a stream of per-key loudness frames: a fast rise well above the
 * key's noise floor, that is not leakage from a neighbour or a harmonic of a lower note.
 */
export class OnsetTracker {
  private readonly keys: KeyState[];
  private cands: Cand[] = [];
  private lastT: number | null = null;
  private noteLike: (i: number) => boolean = () => false;
  private frame: ArrayLike<number> = [];

  constructor(readonly lo: number, readonly hi: number) {
    this.keys = Array.from({ length: hi - lo + 1 }, () => ({ hist: [], floor: NaN, on: false, peak: -120, lastOnset: -1e9 }));
  }

  /** Feeds one frame (db per key, lo…hi). Returns confirmed starts and released keys. */
  feed(t: number, db: ArrayLike<number>, fundDb: ArrayLike<number>): { onsets: Onset[]; releases: number[] } {
    const dt = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;
    const releases: number[] = [];
    const median = [...Array.from(db)].sort((a, b) => a - b)[db.length >> 1];
    let max = -Infinity;
    let maxFund = -Infinity;
    for (let i = 0; i < this.keys.length; i++) {
      max = Math.max(max, db[i]);
      maxFund = Math.max(maxFund, fundDb[i]);
    }
    // Looks like a note right now: own fundamental, not drowned by a neighbour or the loudest key.
    const noteLike = (i: number) => {
      let nb = -Infinity;
      for (let j = Math.max(0, i - 2); j <= Math.min(db.length - 1, i + 2); j++) if (j !== i) nb = Math.max(nb, db[j]);
      return db[i] > -100 && db[i] >= median + ABOVE_MEDIAN && db[i] >= max - BELOW_MAX && fundDb[i] >= db[i] - FUND_MIN &&
        fundDb[i] >= maxFund - BELOW_MAX + 5 && db[i] >= nb - NEIGHBOUR_DB;
    };
    this.noteLike = noteLike;
    this.frame = db;
    this.keys.forEach((k, i) => {
      const d = db[i];
      const midi = this.lo + i;
      k.floor = Number.isNaN(k.floor) || d < k.floor ? d : k.floor + FLOOR_RISE_PER_S * dt;
      let min = Infinity;
      for (const h of k.hist) if (h.t >= t - 0.3 && h.t <= t - 0.06) min = Math.min(min, h.db);
      const tonal = noteLike(i);
      k.hist.push({ t, db: d, tonal });
      while (k.hist.length && k.hist[0].t < t - 1) k.hist.shift();

      const pending = this.cands.find((c) => c.midi === midi && !c.final);
      if (pending) {
        pending.peak = Math.max(pending.peak, d);
        pending.seen++;
        if (tonal) pending.tonal++;
      }
      if (k.on) {
        k.peak = Math.max(k.peak, d);
        if (d < k.peak - RELEASE_DROP || d < k.floor + RELEASE_FLOOR) {
          k.on = false;
          releases.push(midi);
        }
      }
      if (min !== Infinity && d - min >= RISE && d >= k.floor + ABOVE_FLOOR && tonal && !k.on && !pending && t - k.lastOnset > REFRACTORY) {
        k.lastOnset = t;
        this.cands.push({ midi, t, db: d, peak: d, dropped: false, final: false, seen: 1, tonal: 1 });
      }
    });
    return { onsets: this.settle(t), releases };
  }

  /**
   * Hand-guided lookup: the key near `midi` that started a steady tone around time `t`
   * (sound may come up to 0.25 s before the hand press is seen). Lower bar than onsets.
   */
  riseNear(midi: number, t: number, spread = 2): number | null {
    let best: { midi: number; db: number } | null = null;
    for (let m = Math.max(this.lo, midi - spread); m <= Math.min(this.hi, midi + spread); m++) {
      let pre = Infinity;
      let post = -Infinity;
      for (const h of this.keys[m - this.lo].hist) {
        if (h.t >= t - 0.6 && h.t <= t - 0.25) pre = Math.min(pre, h.db);
        if (h.t > t - 0.25 && h.t <= t + 0.35 && h.tonal) post = Math.max(post, h.db);
      }
      if (pre === Infinity || post - pre < GUIDED_RISE) continue;
      const score = post - Math.abs(m - midi) * 3;
      if (!best || score > best.db) best = { midi: m, db: score };
    }
    return best?.midi ?? null;
  }

  private settle(t: number): Onset[] {
    const out: Onset[] = [];
    for (const c of this.cands) {
      if (c.final || t - c.t < SETTLE) continue;
      c.final = true;
      // Re-check once the attack click (broadband) has passed.
      // A synth note is a steady tone; speech and knocks glide or vanish within the settle time.
      if (!this.noteLike(c.midi - this.lo) || c.tonal < STEADY * c.seen) { console.log('DBG drop-steady', c.midi, c.t.toFixed(2), c.tonal, c.seen, this.noteLike(c.midi - this.lo)); c.dropped = true; continue; }
      const near = this.cands.filter((o) => o !== c && Math.abs(o.t - c.t) <= 0.25);
      const leak = near.some((o) => Math.abs(o.midi - c.midi) <= 2 && o.peak >= c.peak + NEIGHBOUR_DB);
      // A lower note sounding now whose harmonics land on this key (it may have been noticed later).
      const i = c.midi - this.lo;
      const harmonic = HARMONIC_STEPS.some((st) => i - st >= 0 && this.frame[i - st] >= this.frame[i] - HARMONIC_DB && this.noteLike(i - st));
      if (leak || harmonic) { console.log('DBG drop', leak ? 'leak' : 'harm', c.midi, c.t.toFixed(2)); c.dropped = true; continue; }
      const k = this.keys[c.midi - this.lo];
      k.on = true;
      k.peak = c.peak;
      out.push({ midi: c.midi, t: c.t, db: c.peak });
    }
    this.cands = this.cands.filter((c) => t - c.t < 0.5);
    return out;
  }
}
