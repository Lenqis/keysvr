import { KeySpectrum, type SampleSource } from './keySpectrum';
import { OnsetTracker, type Onset } from './onsetTracker';

/** Analysis frames per second (each covers all keys). */
const TICK = 0.025;

/** Continuously listens to every key of the keyboard and reports note starts/ends. */
export class MicKeys {
  private readonly spectrum: KeySpectrum;
  private readonly tracker: OnsetTracker;
  private lastEnd = 0;
  /** Loudest clearly sounding key recently (for the "Слышу: …" readout). */
  loudest: { midi: number; db: number; t: number } | null = null;

  constructor(private readonly src: SampleSource, readonly lo: number, readonly hi: number) {
    this.spectrum = new KeySpectrum(src, lo, hi);
    this.tracker = new OnsetTracker(lo, hi);
  }

  /** Audio-clock time (s) of the newest analysed audio. */
  get time(): number {
    return this.lastEnd / this.src.sampleRate;
  }

  /** Analyses every 25 ms step of new audio (catches up after slow frames, max 1.5 s). */
  update(): { onsets: Onset[]; releases: number[] } {
    const step = Math.round(TICK * this.src.sampleRate);
    const onsets: Onset[] = [];
    const releases: number[] = [];
    let end = Math.max(this.lastEnd + step, this.src.written - 60 * step);
    for (; end <= this.src.written; end += step) {
      const r = this.tick(end);
      onsets.push(...r.onsets);
      releases.push(...r.releases);
    }
    return { onsets, releases };
  }

  private tick(end: number): { onsets: Onset[]; releases: number[] } {
    if (!this.spectrum.compute(end)) return { onsets: [], releases: [] };
    this.lastEnd = end;
    const t = end / this.src.sampleRate;
    const db = this.spectrum.db;
    const sorted = [...db].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    let top = 0;
    for (let i = 1; i < db.length; i++) if (db[i] > db[top]) top = i;
    if (db[top] > median + 20 && db[top] > -90) this.loudest = { midi: this.lo + top, db: db[top], t };
    else if (this.loudest && t - this.loudest.t > 0.6) this.loudest = null;
    return this.tracker.feed(t, db, this.spectrum.fundDb);
  }
}
