import * as THREE from 'three';
import { DEFAULT_PRESET, buildLayout } from '../calibration/keyboardModel';

/**
 * Dev/emulator only: a stand-in for the real 61-key synth (the emulated room
 * has no Tesler KB-6150). Lets test scripts calibrate and press keys.
 * Key tops at y = 0.78 m, slightly rotated to exercise the calibration math.
 */
export function addFakeSynth(scene: THREE.Scene) {
  const layout = buildLayout(DEFAULT_PRESET, 35 * 0.0235);
  const group = new THREE.Group();
  group.position.set(-layout.keys.at(-1)!.x / 2 + 0.03, 0.78, -0.33);
  group.rotation.y = 0.08;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(layout.keys.at(-1)!.x + 0.16, 0.07, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x26282c }),
  );
  body.position.set(layout.keys.at(-1)!.x / 2, -0.045, -0.12);
  group.add(body);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xe9e9e4 });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x9a9a95 });
  for (const k of layout.keys) {
    const len = k.zFront - k.zBack;
    const h = k.black ? 0.012 : 0.015;
    const geo = new THREE.BoxGeometry(k.width, h, len);
    const key = new THREE.Mesh(geo, k.black ? blackMat : whiteMat);
    key.position.set(k.x, k.top - h / 2, (k.zFront + k.zBack) / 2);
    group.add(key);
    if (!k.black) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(key.position);
      group.add(edges);
    }
  }
  scene.add(group);
  group.updateMatrixWorld(true);

  const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(group.matrixWorld);
  const api = {
    /** front-edge centre of the lowest / highest key, on the surface */
    left: world(layout.keys[0].x, 0, -0.004),
    right: world(layout.keys.at(-1)!.x, 0, -0.004),
    /** point on a key's top surface, `back` metres from its front edge */
    keyPoint(midi: number, back = 0.03, above = 0) {
      const k = layout.keys.find((kk) => kk.midi === midi)!;
      return world(k.x, k.top + above, k.zFront - back);
    },
  };
  (window as unknown as { fakeSynth: typeof api }).fakeSynth = api;
  return api;
}
