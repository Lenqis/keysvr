import * as THREE from 'three';

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
  visible = false;

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
  }

  /** World-space fingertip positions of this hand (valid only while visible). */
  fingertips(): Record<Finger, THREE.Vector3> { return this.tips; }

  update(): void {
    const joints = this.hand.joints;
    const wrist = joints?.wrist;
    this.visible = !!wrist && wrist.visible;
    this.object.visible = this.visible;
    if (!joints || !this.visible) return;

    ALL_JOINTS.forEach((name, i) => {
      const j = joints[name];
      if (!j) return;
      j.getWorldPosition(this.pos);
      const tip = name.endsWith('tip');
      // Metacarpals sit inside the palm: hide them; cap radius so the wrist isn't a blob.
      const r = name.includes('metacarpal') ? 0 : tip ? 0.0075 : Math.min(j.jointRadius ?? 0.008, 0.0065);
      this.tmp.makeScale(r, r, r).setPosition(this.pos);
      this.spheres.setMatrixAt(i, this.tmp);
    });
    this.spheres.instanceMatrix.needsUpdate = true;

    const attr = this.bones.geometry.getAttribute('position') as THREE.BufferAttribute;
    (this.bones.userData.pairs as string[][]).forEach(([a, b], i) => {
      joints[a]?.getWorldPosition(this.pos);
      attr.setXYZ(i * 2, this.pos.x, this.pos.y, this.pos.z);
      joints[b]?.getWorldPosition(this.pos);
      attr.setXYZ(i * 2 + 1, this.pos.x, this.pos.y, this.pos.z);
    });
    attr.needsUpdate = true;

    for (const f of FINGERS) joints[FINGER_JOINTS[f].at(-1)!]?.getWorldPosition(this.tips[f]);
  }
}
