import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PRESET, buildLayout, keyAt, noteLabel, whiteCount, MIDDLE_C, KEY_PRESETS, isBlack } from './keyboardModel';
import { KeyboardCalibration, TIP_ABOVE_SURFACE, frameFromPoints } from './keyboardFrame';
import { KeyPressDetector } from '../hands/keyPress';

const PITCH = 0.0235;

describe('keyboardModel', () => {
  it('61 keys = 36 white keys, C2..C7', () => {
    expect(whiteCount(DEFAULT_PRESET)).toBe(36);
    const l = buildLayout(DEFAULT_PRESET, 35 * PITCH);
    expect(l.keys).toHaveLength(61);
    expect(l.keys[0].midi).toBe(36);
    expect(l.keys.at(-1)!.midi).toBe(96);
    expect(l.pitch).toBeCloseTo(PITCH, 6);
  });

  it('every preset starts and ends on a white key', () => {
    for (const p of KEY_PRESETS) {
      expect(isBlack(p.lowestMidi)).toBe(false);
      expect(isBlack(p.lowestMidi + p.keyCount - 1)).toBe(false);
    }
  });

  it('finds white and black keys by position', () => {
    const l = buildLayout(DEFAULT_PRESET, 35 * PITCH);
    // middle C is white key #14 (C2..B3 = 14 whites before it)
    expect(keyAt(l, 14 * PITCH, -0.02)?.midi).toBe(MIDDLE_C);
    // between C4 and D4 at the back → C#4
    expect(keyAt(l, 14.4 * PITCH, -0.12)?.midi).toBe(61);
    // same x but at the front (black keys don't reach) → C4 or D4 white
    expect([60, 62]).toContain(keyAt(l, 14.4 * PITCH, -0.02)?.midi);
    // far in front of the keyboard → nothing
    expect(keyAt(l, 14 * PITCH, 0.05)).toBeNull();
  });

  it('labels notes in Russian and English', () => {
    expect(noteLabel(60)).toBe('до · C4');
    expect(noteLabel(69)).toBe('ля · A4');
  });
});

describe('keyboardFrame', () => {
  it('maps the touched points to local frame, any yaw', () => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    const left = new THREE.Vector3(-0.41, 0.8, -0.4).applyQuaternion(yaw);
    const right = new THREE.Vector3(0.41, 0.8, -0.4).applyQuaternion(yaw);
    const { base, span } = frameFromPoints(left, right);
    expect(span).toBeCloseTo(0.82, 6);
    const cal = new KeyboardCalibration(base, span, DEFAULT_PRESET);
    const r = cal.toLocal(right);
    expect(r.x).toBeCloseTo(0.82, 5);
    expect(r.y).toBeCloseTo(TIP_ABOVE_SURFACE, 5);
    expect(r.z).toBeCloseTo(0, 5);
    // a point toward the player (origin side) has +z
    const towardPlayer = cal.toLocal(new THREE.Vector3(0, 0.8, 0));
    expect(towardPlayer.z).toBeGreaterThan(0);
  });
});

describe('KeyPressDetector', () => {
  const DT = 1 / 72;
  const setup = () => {
    const { base, span } = frameFromPoints(new THREE.Vector3(0, 0.8, -0.4), new THREE.Vector3(35 * PITCH, 0.8, -0.4));
    const cal = new KeyboardCalibration(base, span, DEFAULT_PRESET);
    const det = new KeyPressDetector(cal);
    // world point above middle C, `depth` metres below the white-key top
    const surface = 0.8 - TIP_ABOVE_SURFACE;
    const atC4 = (depth: number) => new Map([['r-index', new THREE.Vector3(14 * PITCH, surface - depth, -0.43)]]);
    /** feed a sequence of depths, return all events */
    const run = (depths: number[]) => depths.flatMap((d) => det.update(atC4(d), DT));
    return { det, run };
  };

  it('fires down on a stroke and up on release, reporting the deepest point', () => {
    const { run } = setup();
    const ev = run([-0.01, -0.006, -0.002, 0.002, 0.006, 0.009, 0.009, 0.004, -0.004]);
    expect(ev.map((e) => `${e.type}:${e.midi}`)).toEqual(['down:60', 'up:60']);
    expect(ev[1].maxDepth).toBeCloseTo(0.009, 6);
  });

  it('ignores a fingertip resting on the key surface (tracking noise)', () => {
    const { run } = setup();
    const depths = Array.from({ length: 60 }, (_, i) => 0.003 + (i % 2 ? 0.004 : -0.003));
    expect(run(depths)).toEqual([]);
  });

  it('ignores a tip that appears already deep (hand under the keyboard)', () => {
    const { run } = setup();
    expect(run([0.02, 0.02])).toEqual([]);
  });

  it('a lower press threshold catches shallow presses', () => {
    const { det, run } = setup();
    det.pressDepth = 0;
    expect(run([-0.012, -0.006, 0.001]).map((e) => e.type)).toEqual(['down']);
  });
});
