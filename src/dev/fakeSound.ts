import { midiToFreq } from '../audio/goertzel';

let bus: GainNode | null = null;

/** Dev/emulator only: mic input that test scripts feed via window.fakeSound(midi). */
export function fakeMicSource(ctx: AudioContext): AudioNode {
  bus = ctx.createGain();
  return bus;
}

/** Plays a synth-like tone (decaying harmonics) into the fake mic. */
export function fakeSound(midi: number, seconds = 1): void {
  if (!bus) return;
  const ctx = bus.context;
  const t = ctx.currentTime;
  for (let h = 1; h <= 4; h++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = midiToFreq(midi) * h;
    g.gain.setValueAtTime(0.15 / h, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + seconds);
  }
}

(window as unknown as { fakeSound: typeof fakeSound }).fakeSound = fakeSound;
