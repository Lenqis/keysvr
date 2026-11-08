import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Button3D } from './button3d';
import { PokeTarget } from './pointer';

// Button3D draws on a 2D canvas; give jsdom-less vitest a tiny stub.
function stubCanvas(): void {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
}

function setup() {
  stubCanvas();
  const button = new Button3D('Test');
  button.group.updateMatrixWorld(true);
  let presses = 0;
  button.onPress = () => presses++;
  return { button, poke: new PokeTarget(button), presses: () => presses };
}

const tip = (x: number, y: number, z: number) => new Map([['r-index', new THREE.Vector3(x, y, z)]]);
const two = (ring: number, pinky: number) => new Map([
  ['r-ring', new THREE.Vector3(0, 0, ring)],
  ['r-pinky', new THREE.Vector3(0.02, 0, pinky)],
]);

describe('PokeTarget', () => {
  it('hovers when a fingertip is near the face, presses on touch', () => {
    const { button, poke, presses } = setup();
    poke.update(tip(0, 0, 0.04), false);
    expect(button.getState()).toBe('hover');
    expect(presses()).toBe(0);
    poke.update(tip(0, 0, 0.0), false);
    expect(button.getState()).toBe('pressed');
    expect(presses()).toBe(1);
  });

  it('does not repeat while the finger rests on the button', () => {
    const { poke, presses } = setup();
    poke.update(tip(0, 0, 0.04), false); // approach from the front
    for (let i = 0; i < 10; i++) poke.update(tip(0, 0, -0.002), false);
    expect(presses()).toBe(1);
    poke.update(tip(0, 0, 0.05), false); // back off → re-armed
    poke.update(tip(0, 0, 0.0), false);
    expect(presses()).toBe(2);
  });

  it('ignores fingertips outside the button outline', () => {
    const { button, poke, presses } = setup();
    poke.update(tip(0.2, 0, 0.0), false);
    expect(presses()).toBe(0);
    expect(button.getState()).toBe('idle');
  });

  it('ring finger presses every time even with the pinky resting nearby', () => {
    const { poke, presses } = setup();
    for (let i = 1; i <= 5; i++) {
      poke.update(two(0.04, 0.012), false); // ring up, pinky hovering 1.2 cm away
      poke.update(two(0.0, 0.012), false); // ring taps
      expect(presses()).toBe(i);
    }
  });

  it('a finger that appears already behind the face does not press', () => {
    const { poke, presses } = setup();
    poke.update(tip(0, 0, -0.03), false);
    expect(presses()).toBe(0);
  });

  it('a finger already touching a freshly shown button does not press it', () => {
    const { poke, presses } = setup();
    poke.update(tip(0, 0, 0.0), false);
    poke.update(tip(0, 0, -0.002), false);
    expect(presses()).toBe(0);
  });
});
