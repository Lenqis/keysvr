import { describe, expect, it } from 'vitest';
import { midiToFreq } from './goertzel';
import type { SampleSource } from './keySpectrum';
import { MicKeys } from './micKeys';
import { PressFusion } from './fusion';

const SR = 48000;
const LO = 36;
const HI = 96;

type Note = { midi: number; on: number; off?: number; amp?: number; timbre?: number[] };

/** Synth-like tones (harmonics with a short attack and a release), plus noise. */
function render(seconds: number, notes: Note[], noise = 0.003): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  let seed = 7;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = noise * ((seed / 2147483647) * 2 - 1);
  }
  for (const n of notes) {
    const f = midiToFreq(n.midi);
    const timbre = n.timbre ?? [1, 0.5, 0.33, 0.25, 0.2, 0.16];
    const end = Math.min(out.length, Math.round((n.off ?? seconds) * SR) + Math.round(0.05 * SR));
    for (let i = Math.round(n.on * SR); i < end; i++) {
      const t = i / SR - n.on;
      const env = Math.min(1, t / 0.01) * (n.off !== undefined && i / SR > n.off ? Math.max(0, 1 - (i / SR - n.off) / 0.05) : 1);
      let v = 0;
      timbre.forEach((a, h) => { v += a * Math.sin(2 * Math.PI * f * (h + 1) * t); });
      out[i] += (n.amp ?? 0.1) * env * v;
    }
  }
  return out;
}

/** Streams the signal through MicKeys in 1024-sample blocks; returns onsets and releases. */
function listen(data: Float32Array) {
  const src = { sampleRate: SR, written: 0, read(from: number, n: number, out: Float32Array) {
    if (from < 0 || from + n > this.written) return false;
    out.set(data.subarray(from, from + n));
    return true;
  } } satisfies SampleSource;
  const mk = new MicKeys(src, LO, HI);
  const onsets: { midi: number; t: number }[] = [];
  const releases: { midi: number; t: number }[] = [];
  for (let w = 1024; w <= data.length; w += 1024) {
    src.written = w;
    const r = mk.update();
    onsets.push(...r.onsets.map((o) => ({ midi: o.midi, t: o.t })));
    releases.push(...r.releases.map((midi) => ({ midi, t: w / SR })));
  }
  return { onsets, releases, mk };
}

const midis = (r: { onsets: { midi: number }[] }) => r.onsets.map((o) => o.midi);

describe('MicKeys (continuous note detection)', () => {
  it('finds single notes across the whole keyboard, once each, near the real start', () => {
    for (const m of [36, 41, 47, 52, 57, 60, 61, 66, 72, 79, 84, 90, 96]) {
      const r = listen(render(1.2, [{ midi: m, on: 0.5, off: 0.9 }]));
      expect(midis(r), `note ${m}`).toEqual([m]);
      expect(r.onsets[0].t - 0.5, `note ${m} delay`).toBeLessThan(0.15);
      expect(r.releases.map((x) => x.midi), `note ${m} release`).toContain(m);
    }
  });

  it('hears nothing in silence / noise', () => {
    expect(midis(listen(render(1.5, [], 0.02)))).toEqual([]);
  });

  it('does not report octave ghosts when the 2nd harmonic is strong', () => {
    const r = listen(render(1.2, [{ midi: 48, on: 0.5, timbre: [0.4, 1, 0.5, 0.3] }]));
    expect(midis(r)).toEqual([48]);
  });

  it('separates a two-key chord of neighbours and a triad', () => {
    expect(midis(listen(render(1.2, [{ midi: 60, on: 0.5 }, { midi: 61, on: 0.5 }]))).sort()).toEqual([60, 61]);
    expect(midis(listen(render(1.2, [64, 67, 72].map((m) => ({ midi: m, on: 0.5 }))))).sort()).toEqual([64, 67, 72]);
  });

  it('catches a quick melody and repeated notes', () => {
    const seq = [60, 62, 64, 62, 60, 60];
    const notes = seq.map((m, i) => ({ midi: m, on: 0.4 + i * 0.3, off: 0.4 + i * 0.3 + 0.22 }));
    expect(midis(listen(render(2.6, notes)))).toEqual(seq);
  });

  it('works for quiet input (no absolute level needed)', () => {
    expect(midis(listen(render(1.2, [{ midi: 69, on: 0.5, amp: 0.003 }], 0.0002)))).toEqual([69]);
  });

  it('handles other timbres: hollow square-like and pure sine', () => {
    for (const timbre of [[1, 0, 0.33, 0, 0.2, 0, 0.14], [1]]) {
      for (const m of [40, 57, 74, 91]) {
        expect(midis(listen(render(1.2, [{ midi: m, on: 0.5, timbre }]))), `${m} ${timbre.length}`).toEqual([m]);
      }
    }
  });

  it('hears a new note while another one is held', () => {
    const r = listen(render(1.6, [{ midi: 55, on: 0.3 }, { midi: 59, on: 0.9 }]));
    expect(midis(r)).toEqual([55, 59]);
  });

  it('neighbour key right after a decayed note', () => {
    const data = render(4, [{ midi: 60, on: 0.5, off: 1.5 }, { midi: 61, on: 3.0, off: 3.6 }]);
    expect(midis(listen(data))).toEqual([60, 61]);
    const tail = render(2.5, [{ midi: 60, on: 0.3 }, { midi: 61, on: 1.6 }]); // 60 still sounding
    expect(midis(listen(tail))).toEqual([60, 61]);
  });

  it('readout names the loudest sounding key', () => {
    const { mk } = listen(render(1.0, [{ midi: 65, on: 0.3 }]));
    expect(mk.loudest?.midi).toBe(65);
  });
});

describe('PressFusion', () => {
  it('mic corrects the hand key; finger is kept', () => {
    const f = new PressFusion();
    expect(f.handDown('1-ring', 60, 1.0)).toEqual([]);
    expect(f.micOnset({ midi: 61, t: 0.9, db: -30 })).toEqual([{ type: 'down', id: '1-ring', midi: 61, tipId: '1-ring', handMidi: 60 }]);
    expect(f.stats.corrected).toBe(1);
    expect(f.handUp('1-ring', 1.3)).toEqual([{ type: 'up', id: '1-ring', midi: 61 }]);
  });

  it('a hovering finger without sound never lights a key', () => {
    const f = new PressFusion();
    f.handDown('1-pinky', 70, 1.0);
    expect(f.update(1.5)).toEqual([]);
    expect(f.stats.handOnly).toBe(1);
  });

  it('a press the hands missed is shown from the mic alone', () => {
    const f = new PressFusion();
    f.micOnset({ midi: 64, t: 2.0, db: -30 });
    const out = f.update(2.4);
    expect(out).toMatchObject([{ type: 'down', midi: 64, tipId: null }]);
    expect(f.micRelease(64)).toMatchObject([{ type: 'up', midi: 64 }]);
  });

  it('chord: each finger gets its own note', () => {
    const f = new PressFusion();
    f.handDown('1-index', 60, 1.0);
    f.handDown('1-middle', 62, 1.0);
    const out = [...f.micOnset({ midi: 62, t: 1.05, db: -30 }), ...f.micOnset({ midi: 60, t: 1.06, db: -30 })];
    expect(out.map((o) => [o.id, o.midi]).sort()).toEqual([['1-index', 60], ['1-middle', 62]]);
  });

  it('a quick tap released before the mic answered still shows briefly', () => {
    const f = new PressFusion();
    f.handDown('0-index', 50, 1.0);
    f.handUp('0-index', 1.1);
    expect(f.micOnset({ midi: 50, t: 1.15, db: -30 })).toHaveLength(1);
    expect(f.update(1.5)).toMatchObject([{ type: 'up', midi: 50 }]);
  });

  it('mic off: hands only, immediately', () => {
    const f = new PressFusion();
    f.setMic(false);
    expect(f.handDown('0-index', 50, 1.0)).toHaveLength(1);
  });
});
