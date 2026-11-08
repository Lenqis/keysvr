import * as THREE from 'three';

/**
 * One Euro filter (Casiez et al. 2012) for 3D points: strong smoothing when
 * the hand is slow (kills jitter), little lag when it moves fast.
 */
export class OneEuroVec3 {
  private readonly x = new THREE.Vector3();
  private readonly dx = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private hasPrev = false;

  constructor(
    private readonly minCutoff = 1.2, // Hz at rest
    private readonly beta = 15, // cutoff increase per m/s of speed
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void { this.hasPrev = false; }

  /** Filters `value` in place; dt in seconds. */
  filter(value: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.hasPrev || dt <= 0) {
      this.x.copy(value);
      this.dx.set(0, 0, 0);
      this.hasPrev = true;
      return value;
    }
    this.tmp.copy(value).sub(this.x).divideScalar(dt);
    this.dx.lerp(this.tmp, OneEuroVec3.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * this.dx.length();
    this.x.lerp(value, OneEuroVec3.alpha(cutoff, dt));
    return value.copy(this.x);
  }

  /** Filtered speed estimate in m/s. */
  speed(): number { return this.dx.length(); }
}
