import { describe, expect, it } from 'vitest';
import { midiToFreq } from './goertzel';
import { judgePress, type SampleSource } from './noteJudge';

const SR = 48000;

/** Synth-like tone: decaying harmonics, starting at `onset` seconds. */
function render(seconds: number, notes: { midi: number; onset: number; amp?: number }[], noise = 0.002): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = noise * ((seed / 2147483647) * 2 - 1);
  }
  for (const n of notes) {
    const f = midiToFreq(n.midi);
    for (let i = Math.round(n.onset * SR); i < out.length; i++) {
      const t = i / SR - n.onset;
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
      out[i] += (n.amp ?? 0.2) * v * Math.exp(-t * 1.5);
    }
  }
  return out;
}

const source = (data: Float32Array): SampleSource => ({
  sampleRate: SR,
  written: data.length,
  now: data.length,
  read(from, n, out) {
    if (from < 0 || from + n > data.length) return false;
    out.set(data.subarray(from, from + n));
    return true;
  },
});

const at = (s: number) => Math.round(s * SR);

describe('judgePress', () => {
  it('confirms the key the hand saw', () => {
    const v = judgePress(source(render(1.5, [{ midi: 60, onset: 0.8 }])), at(0.8), 60, 36, 96);
    expect(v).toEqual({ kind: 'match', midi: 60 });
  });

  it('corrects to the neighbouring key that actually sounded', () => {
    for (const real of [37, 49, 61, 73, 85, 95]) {
      const v = judgePress(source(render(1.5, [{ midi: real, onset: 0.82 }])), at(0.8), real - 1, 36, 96);
      expect(v, `real ${real}`).toEqual({ kind: 'corrected', midi: real, handMidi: real - 1 });
    }
  });

  it('corrects two keys away, also in the lowest octave', () => {
    const v = judgePress(source(render(1.5, [{ midi: 38, onset: 0.78 }])), at(0.8), 36, 36, 96);
    expect(v).toEqual({ kind: 'corrected', midi: 38, handMidi: 36 });
  });

  it('ignores a neighbour that was already sounding before the press', () => {
    const v = judgePress(
      source(render(1.5, [{ midi: 61, onset: 0.1, amp: 0.3 }, { midi: 60, onset: 0.8, amp: 0.15 }])),
      at(0.8), 60, 36, 96,
    );
    expect(v).toEqual({ kind: 'match', midi: 60 });
  });

  it('reports silence when nothing new sounded (hand result stays)', () => {
    expect(judgePress(source(render(1.5, [])), at(0.8), 60, 36, 96)).toEqual({ kind: 'silent', midi: 60 });
    const held = render(1.5, [{ midi: 60, onset: 0.1 }]);
    expect(judgePress(source(held), at(0.8), 60, 36, 96).kind).toBe('silent');
  });

  it('works with a chord where another new note is far away', () => {
    const v = judgePress(source(render(1.5, [{ midi: 64, onset: 0.8 }, { midi: 72, onset: 0.8 }])), at(0.8), 65, 36, 96);
    expect(v).toEqual({ kind: 'corrected', midi: 64, handMidi: 65 });
  });

  it('keeps both keys of a neighbouring two-finger chord', () => {
    const data = render(1.5, [{ midi: 60, onset: 0.8 }, { midi: 61, onset: 0.8 }]);
    expect(judgePress(source(data), at(0.8), 60, 36, 96)).toEqual({ kind: 'match', midi: 60 });
    expect(judgePress(source(data), at(0.8), 61, 36, 96)).toEqual({ kind: 'match', midi: 61 });
  });
});
