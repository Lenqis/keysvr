import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OneEuroVec3 } from './oneEuro';

describe('OneEuroVec3', () => {
  it('smooths small jitter at rest', () => {
    const f = new OneEuroVec3();
    const dt = 1 / 72;
    let maxDev = 0;
    for (let i = 0; i < 200; i++) {
      const noisy = new THREE.Vector3((i % 2 ? 1 : -1) * 0.002, 0, 0); // ±2 mm jitter
      const x = f.filter(noisy, dt).x;
      if (i > 20) maxDev = Math.max(maxDev, Math.abs(x));
    }
    expect(maxDev).toBeLessThan(0.001); // jitter at least halved
  });

  it('follows a fast move with little lag', () => {
    const f = new OneEuroVec3();
    const dt = 1 / 72;
    const v = new THREE.Vector3();
    for (let i = 0; i < 36; i++) f.filter(v.set(i * dt * 0.5, 0, 0), dt); // 0.5 m/s for 0.5 s
    const truth = 35 * dt * 0.5;
    expect(truth - v.x).toBeLessThan(0.02); // under 2 cm behind
  });
});
