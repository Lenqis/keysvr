import { notePower, windowFor } from './goertzel';

/** Read access to recent mic samples, indexed by absolute sample number. */
export interface SampleSource {
  readonly sampleRate: number;
  /** absolute index just after the last received sample */
  readonly written: number;
  /** absolute index of the sample being heard right now (audio clock) */
  readonly now: number;
  /** copies samples [from, from+n) into out; false if not (or no longer) buffered */
  read(from: number, n: number, out: Float32Array): boolean;
}

export type Verdict =
  | { kind: 'match'; midi: number }
  | { kind: 'corrected'; midi: number; handMidi: number }
  | { kind: 'silent'; midi: number };

/** Candidates around the key the hand chose: the hand is off by ±2 keys at most. */
export const SPREAD = 2;
/** Note must rise this much vs. before the press to count as a new sound. */
const ONSET_RATIO = 3;
/** In a chord the hand's own key may be be quieter than a neighbour; spectral leakage stays below ~0.4. */
const OWN_SHARE = 0.6;
/** Absolute floor for a sounding note (normalised power, ~-50 dBFS). */
export const MIN_POWER = 1e-6;
/** Time around the detected press where the sound onset may be (s). */
const AFTER_FROM = -0.08;
const AFTER_TO = 0.22;
const BEFORE_FROM = -0.4;
const BEFORE_TO = -0.15;

/** Seconds of audio needed after the press before a verdict is possible. */
export const JUDGE_DELAY = AFTER_TO + 0.03;

/**
 * Decides which of the hand's candidate keys actually sounded right after a press.
 * `at` = sample index at the moment the hand press was detected.
 */
export function judgePress(src: SampleSource, at: number, handMidi: number, lo: number, hi: number): Verdict {
  const sr = src.sampleRate;
  const cands: number[] = [];
  for (let m = handMidi - SPREAD; m <= handMidi + SPREAD; m++) if (m >= lo && m <= hi) cands.push(m);
  const n = Math.max(...cands.map((m) => windowFor(m, sr)));
  const buf = new Float32Array(n);

  const maxOver = (from: number, to: number): number[] | null => {
    const best = cands.map(() => 0);
    const step = Math.round(n / 3);
    let any = false;
    for (let s = at + Math.round(from * sr); s <= at + Math.round(to * sr); s += step) {
      if (!src.read(s, n, buf)) continue;
      any = true;
      cands.forEach((m, i) => { best[i] = Math.max(best[i], notePower(buf, 0, windowFor(m, sr), sr, m)); });
    }
    return any ? best : null;
  };
  const after = maxOver(AFTER_FROM, AFTER_TO - n / sr);
  const before = maxOver(BEFORE_FROM, BEFORE_TO - n / sr) ?? cands.map(() => 0);
  if (!after) return { kind: 'silent', midi: handMidi };

  const fresh = (i: number) => after[i] > MIN_POWER && after[i] > ONSET_RATIO * before[i];
  let pick = -1;
  cands.forEach((_, i) => {
    if (fresh(i) && (pick < 0 || after[i] > after[pick])) pick = i;
  });
  if (pick < 0) return { kind: 'silent', midi: handMidi };
  // Chord of neighbouring keys: if the hand's key sounded too, trust the hand.
  const own = cands.indexOf(handMidi);
  if (own >= 0 && fresh(own) && after[own] > OWN_SHARE * after[pick]) return { kind: 'match', midi: handMidi };
  const midi = cands[pick];
  return midi === handMidi ? { kind: 'match', midi } : { kind: 'corrected', midi, handMidi };
}
