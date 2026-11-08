import { JUDGE_DELAY, judgePress, type SampleSource, type Verdict } from './noteJudge';

export interface CheckedPress {
  tipId: string;
  verdict: Verdict;
}

interface Pending {
  tipId: string;
  handMidi: number;
  at: number;
}

/**
 * Queues hand presses and, once enough audio has arrived, asks the mic which
 * key really sounded. Without a working mic every press stays as the hand saw it.
 */
export class PressChecker {
  private pending: Pending[] = [];
  readonly stats = { match: 0, corrected: 0, silent: 0 };

  constructor(private readonly src: SampleSource, private readonly lo: () => number, private readonly hi: () => number) {}

  onPress(tipId: string, handMidi: number): void {
    this.pending.push({ tipId, handMidi, at: this.src.now });
  }

  /** Verdicts for presses whose audio window is complete. */
  update(): CheckedPress[] {
    const due = this.src.written - Math.round(JUDGE_DELAY * this.src.sampleRate);
    const out: CheckedPress[] = [];
    this.pending = this.pending.filter((p) => {
      if (p.at > due) return true;
      const verdict = judgePress(this.src, p.at, p.handMidi, this.lo(), this.hi());
      this.stats[verdict.kind]++;
      out.push({ tipId: p.tipId, verdict });
      return false;
    });
    return out;
  }

  resetStats(): void {
    this.stats.match = this.stats.corrected = this.stats.silent = 0;
  }
}
