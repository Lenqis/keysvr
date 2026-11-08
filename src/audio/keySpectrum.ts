import { midiToFreq } from './goertzel';

/** Read access to recent mic samples, indexed by absolute sample number (audio clock). */
export interface SampleSource {
  readonly sampleRate: number;
  /** absolute index just after the last received sample */
  readonly written: number;
  /** copies samples [from, from+n) into out; false if not (or no longer) buffered */
  read(from: number, n: number, out: Float32Array): boolean;
}

const HARMONICS = 4;
/** Below this note a longer window is needed to separate semitones. */
const LOW_SPLIT = 52;

interface Win { raw: Float32Array; win: Float32Array; hann: Float32Array; n: number; d: number }

/**
 * Loudness (dB) of every key in [lo, hi] in the audio just before a sample index:
 * Hann-windowed Goertzel summed over the first harmonics. Lower keys are analysed on
 * a decimated signal (box-filter average), which makes a frame ~5× cheaper.
 */
export class KeySpectrum {
  readonly db: Float32Array;
  /** dB of the fundamental alone (a real note has one; sub-harmonic ghosts don't) */
  readonly fundDb: Float32Array;
  private readonly plan: { midi: number; w: Win }[] = [];
  private readonly wins: Win[] = [];

  constructor(private readonly src: SampleSource, readonly lo: number, readonly hi: number) {
    this.db = new Float32Array(hi - lo + 1).fill(-120);
    this.fundDb = new Float32Array(hi - lo + 1).fill(-120);
    const sr = src.sampleRate;
    for (let midi = lo; midi <= hi; midi++) {
      const n = Math.round(sr * (midi < LOW_SPLIT ? 0.17 : 0.085));
      // Highest analysed harmonic must stay well below the decimated Nyquist.
      let d = 8;
      while (d > 1 && midiToFreq(midi) * HARMONICS > sr / (2.5 * d)) d /= 2;
      let w = this.wins.find((x) => x.n === n && x.d === d);
      if (!w) {
        const m = Math.floor(n / d);
        const hann = new Float32Array(m);
        for (let i = 0; i < m; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1));
        w = { raw: new Float32Array(n), win: new Float32Array(m), hann, n, d };
        this.wins.push(w);
      }
      this.plan.push({ midi, w });
    }
  }

  /** Recomputes `db` for the audio ending at `end`; false if it is not buffered. */
  compute(end: number): boolean {
    for (const w of this.wins) {
      if (!this.src.read(end - w.n, w.n, w.raw)) return false;
      const m = w.win.length;
      for (let i = 0; i < m; i++) {
        let sum = 0;
        for (let k = 0; k < w.d; k++) sum += w.raw[i * w.d + k];
        w.win[i] = (sum / w.d) * w.hann[i];
      }
    }
    const sr = this.src.sampleRate;
    for (const { midi, w } of this.plan) {
      const rate = sr / w.d;
      const m = w.win.length;
      const f0 = midiToFreq(midi);
      let p = 0;
      let p1 = 0;
      for (let h = 1; h <= HARMONICS; h++) {
        if (f0 * h >= rate / 2 - 100) continue;
        const ph = goertzelRaw(w.win, m, (2 * Math.PI * f0 * h) / rate);
        if (h === 1) p1 = ph;
        p += ph;
      }
      this.db[midi - this.lo] = 10 * Math.log10(p / (m * m) + 1e-12);
      this.fundDb[midi - this.lo] = 10 * Math.log10(p1 / (m * m) + 1e-12);
    }
    return true;
  }
}
function goertzelRaw(x: Float32Array, n: number, w: number): number {
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
