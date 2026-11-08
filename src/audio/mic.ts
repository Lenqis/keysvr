import type { SampleSource } from './keySpectrum';

/** Worklet that forwards mic samples to the main thread in ~20 ms batches. */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    // No active input → silence: still write zeros so sample indices track real time.
    const ch = inputs[0] && inputs[0][0];
    for (let i = 0; i < 128; i++) {
      this.buf[this.n++] = ch ? ch[i] : 0;
      // end = absolute sample frame (audio clock) just after this batch
      if (this.n === this.buf.length) { this.port.postMessage({ end: currentFrame + i + 1, data: this.buf.slice() }); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('keysvr-tap', Tap);`;

const RING_SECONDS = 2;

/**
 * Microphone capture into a ring buffer (raw: no echo cancelling / noise suppression,
 * they would eat sustained synth tones). Also usable with any AudioNode as input (emulator).
 */
export class Mic implements SampleSource {
  sampleRate = 48000;
  written = 0;
  /** smoothed RMS level 0…1 for the UI meter */
  level = 0;
  state: 'off' | 'starting' | 'on' | 'denied' | 'error' = 'off';
  ctx: AudioContext | null = null;
  private ring = new Float32Array(1);
  private input: AudioNode | null = null;

  /** Must be called from a user gesture (creates/resumes the AudioContext). */
  async start(source?: (ctx: AudioContext) => AudioNode): Promise<void> {
    if (this.state === 'on' || this.state === 'starting') return;
    this.state = 'starting';
    try {
      const ctx = this.ctx ?? new AudioContext();
      this.ctx = ctx;
      void ctx.resume();
      if (source) this.input = source(ctx);
      else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        this.input = ctx.createMediaStreamSource(stream);
      }
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      const tap = new AudioWorkletNode(ctx, 'keysvr-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      this.sampleRate = ctx.sampleRate;
      this.ring = new Float32Array(Math.round(ctx.sampleRate * RING_SECONDS));
      tap.port.onmessage = (e: MessageEvent<{ end: number; data: Float32Array }>) => this.push(e.data.end, e.data.data);
      this.input.connect(tap);
      // A silent sink keeps the worklet running on all browsers.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      tap.connect(mute).connect(ctx.destination);
      this.state = 'on';
    } catch (err) {
      this.state = (err as DOMException).name === 'NotAllowedError' ? 'denied' : 'error';
      console.warn('mic:', err);
    }
  }

  /** Current sample index on the audio clock (what the mic hears "now"). */
  get now(): number {
    return this.ctx ? Math.round(this.ctx.currentTime * this.sampleRate) : this.written;
  }

  private push(end: number, block: Float32Array): void {
    const len = this.ring.length;
    const start = end - block.length;
    let sq = 0;
    for (let i = 0; i < block.length; i++) {
      this.ring[(start + i) % len] = block[i];
      sq += block[i] * block[i];
    }
    this.written = end;
    const rms = Math.sqrt(sq / block.length);
    this.level = Math.max(rms, this.level * 0.9);
  }

  read(from: number, n: number, out: Float32Array): boolean {
    const len = this.ring.length;
    if (from < 0 || from + n > this.written || from < this.written - len) return false;
    for (let i = 0; i < n; i++) out[i] = this.ring[(from + i) % len];
    return true;
  }
}

/** Has the page already been allowed to use the microphone? (no prompt then) */
export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}
