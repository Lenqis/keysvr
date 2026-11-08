/** Frequency of a MIDI note (A4 = 69 = 440 Hz). */
export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const hannCache = new Map<number, Float32Array>();
function hann(n: number): Float32Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return w;
}

/** Normalised power of one frequency in samples[start, start+n) (Hann-windowed Goertzel). */
export function goertzel(samples: Float32Array, start: number, n: number, sampleRate: number, freq: number): number {
  const w = hann(n);
  const coeff = 2 * Math.cos((2 * Math.PI * freq) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = samples[start + i] * w[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return p / (n * n);
}

const HARMONICS = [1, 2, 3, 4];

/**
 * Strength of a note in a window: power summed over its first harmonics
 * (higher harmonics separate neighbouring semitones better in the low register).
 */
export function notePower(samples: Float32Array, start: number, n: number, sampleRate: number, midi: number): number {
  const f0 = midiToFreq(midi);
  let sum = 0;
  for (const h of HARMONICS) {
    const f = f0 * h;
    if (f < sampleRate / 2 - 200) sum += goertzel(samples, start, n, sampleRate, f);
  }
  return sum;
}

/** Window length: longer for low notes (finer frequency resolution). */
export const windowFor = (midi: number, sampleRate: number): number =>
  midi < 52 ? Math.round(sampleRate * 0.17) : Math.round(sampleRate * 0.085);
