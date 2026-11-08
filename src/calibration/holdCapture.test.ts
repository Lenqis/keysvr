import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HoldCapture } from './holdCapture';

const DT = 1 / 72;
const run = (cap: HoldCapture, seconds: number, at: (t: number) => THREE.Vector3) => {
  for (let t = 0; t < seconds; t += DT) {
    const hit = cap.update(new Map([['0-index', at(t)]]), DT, () => true);
    if (hit) return { hit, t };
  }
  return null;
};

describe('HoldCapture', () => {
  it('ignores a hand hovering still in the air', () => {
    const cap = new HoldCapture();
    expect(run(cap, 3, () => new THREE.Vector3(0.2, 1.0, -0.1))).toBeNull();
  });

  it('ignores a hand that moved sideways and stopped (no descent)', () => {
    const cap = new HoldCapture();
    expect(run(cap, 3, (t) => new THREE.Vector3(Math.min(t, 0.5) * 0.4, 1.0, -0.1))).toBeNull();
  });

  it('captures a fingertip that comes down onto a key and holds ~1 s', () => {
    const cap = new HoldCapture();
    const r = run(cap, 3, (t) => new THREE.Vector3(0, 0.8 + Math.max(0, 0.3 - t) * 0.2, -0.4));
    expect(r).not.toBeNull();
    expect(r!.hit.y).toBeCloseTo(0.8, 2);
    expect(r!.t).toBeGreaterThan(1.2);
    expect(r!.t).toBeLessThan(1.5);
  });
});
