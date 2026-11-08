import * as THREE from 'three';
import { OneEuroVec3 } from './oneEuro';

/** Finger colors — also used later for note colors (one color per finger). */
export const FINGER_COLORS = {
  thumb: 0xff6b6b,
  index: 0xffd93d,
  middle: 0x6bcb77,
  ring: 0x4d96ff,
  pinky: 0xc77dff,
} as const;
export type Finger = keyof typeof FINGER_COLORS;

const FINGER_JOINTS: Record<Finger, string[]> = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};
const FINGERS = Object.keys(FINGER_JOINTS) as Finger[];
const ALL_JOINTS = ['wrist', ...FINGERS.flatMap((f) => FINGER_JOINTS[f])];
const TIP_RADIUS = 0.0055;
/** Above this wrist speed Quest tracking gets unreliable (motion blur): fade + ignore. */
const FAST_SPEED = 1.5; // m/s

/** Hand group as filled in by three.js WebXRManager (joints appear while tracked). */
type XRHandGroup = THREE.Group & { joints?: Record<string, THREE.Group & { jointRadius?: number }> };

/**
 * Semi-transparent glowing "glove" made of joint spheres and finger bones,
 * with fingertips tinted by finger color.
 */
export class HandView {
  readonly object = new THREE.Group();
  private readonly spheres: THREE.InstancedMesh;
  private readonly bones: THREE.LineSegments;
  private readonly tmp = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly tips: Record<Finger, THREE.Vector3>;
  private readonly filters = ALL_JOINTS.map(() => new OneEuroVec3());
  /** Light smoothing for key detection: little lag when moving between keys. */
  private readonly pressFilters = FINGERS.map(() => new OneEuroVec3(3, 60));
  private readonly pressTipsOut: Record<Finger, THREE.Vector3>;
  private readonly world = ALL_JOINTS.map(() => new THREE.Vector3());
  private readonly dir = new THREE.Vector3();
  visible = false;
  /** False while the hand moves too fast to trust (presses are ignored). */
  reliable = false;

  constructor(private readonly hand: XRHandGroup) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false,
    });
    this.spheres = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, ALL_JOINTS.length);
    this.spheres.frustumCulled = false;
    const base = new THREE.Color(0x9fefff);
    ALL_JOINTS.forEach((name, i) => {
      const finger = FINGERS.find((f) => name === FINGER_JOINTS[f].at(-1));
      this.spheres.setColorAt(i, finger ? new THREE.Color(FINGER_COLORS[finger]) : base);
    });
    const pairs = FINGERS.flatMap((f) => {
      const chain = ['wrist', ...FINGER_JOINTS[f]];
      return chain.slice(1).map((_, i) => [chain[i], chain[i + 1]]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pairs.length * 6), 3));
    this.bones = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x9fefff, transparent: true, opacity: 0.45, depthWrite: false,
    }));
    this.bones.frustumCulled = false;
    // Draw after the UI so a finger in front of a panel stays visible (depth test still hides it behind).
    this.spheres.renderOrder = 5;
    this.bones.renderOrder = 5;
    this.bones.userData.pairs = pairs;
    this.object.add(this.spheres, this.bones);
    this.object.visible = false;
    this.tips = Object.fromEntries(FINGERS.map((f) => [f, new THREE.Vector3()])) as Record<Finger, THREE.Vector3>;
    this.pressTipsOut = Object.fromEntries(FINGERS.map((f) => [f, new THREE.Vector3()])) as Record<Finger, THREE.Vector3>;
  }

  /** World-space fingertip positions of this hand (valid only while visible). */
  fingertips(): Record<Finger, THREE.Vector3> { return this.tips; }
  /** Fingertips with light smoothing, for key-press detection (less lag). */
  pressTips(): Record<Finger, THREE.Vector3> { return this.pressTipsOut; }

  update(dt: number): void {
    const joints = this.hand.joints;
    const wrist = joints?.wrist;
    const wasVisible = this.visible;
    this.visible = !!wrist && wrist.visible;
    this.object.visible = this.visible;
    if (!joints || !this.visible) return;
    if (!wasVisible) [...this.filters, ...this.pressFilters].forEach((f) => f.reset());
    FINGERS.forEach((f, i) => {
      const j = joints[FINGER_JOINTS[f].at(-1)!];
      if (!j) return;
      j.getWorldPosition(this.pressTipsOut[f]);
      this.pressFilters[i].filter(this.pressTipsOut[f], dt);
    });

    // Smoothed world positions of all joints.
    ALL_JOINTS.forEach((name, i) => {
      joints[name]?.getWorldPosition(this.world[i]);
      this.filters[i].filter(this.world[i], dt);
    });
    const index = (name: string) => ALL_JOINTS.indexOf(name);

    this.reliable = this.filters[0].speed() < FAST_SPEED;
    const mat = this.spheres.material as THREE.MeshBasicMaterial;
    mat.opacity = this.reliable ? 0.75 : 0.2;
    (this.bones.material as THREE.LineBasicMaterial).opacity = this.reliable ? 0.45 : 0.12;

    ALL_JOINTS.forEach((name, i) => {
      const p = this.world[i];
      let r = Math.min(joints[name]?.jointRadius ?? 0.008, 0.0065);
      if (name.includes('metacarpal')) r = 0; // inside the palm
      if (name.endsWith('tip')) {
        // The tip joint is the very end of the finger: pull the dot back by its
        // radius so its outer edge (not its center) sits at the fingertip.
        const prev = this.world[i - 1];
        this.dir.copy(p).sub(prev).normalize();
        this.pos.copy(p).addScaledVector(this.dir, -TIP_RADIUS);
        r = TIP_RADIUS;
      } else {
        this.pos.copy(p);
      }
      this.tmp.makeScale(r, r, r).setPosition(this.pos);
      this.spheres.setMatrixAt(i, this.tmp);
    });
    this.spheres.instanceMatrix.needsUpdate = true;

    const attr = this.bones.geometry.getAttribute('position') as THREE.BufferAttribute;
    (this.bones.userData.pairs as string[][]).forEach(([a, b], i) => {
      const pa = this.world[index(a)];
      const pb = this.world[index(b)];
      attr.setXYZ(i * 2, pa.x, pa.y, pa.z);
      attr.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z);
    });
    attr.needsUpdate = true;

    for (const f of FINGERS) this.tips[f].copy(this.world[index(FINGER_JOINTS[f].at(-1)!)]);
  }
}
