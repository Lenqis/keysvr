import * as THREE from 'three';

const YELLOW = '#ffd93d';

/** Calibration touch feedback: a progress ring while holding, a dot on the captured left key. */
export class TouchMarkers {
  readonly ring: THREE.Mesh;
  readonly marker: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.014, 0.019, 40),
      new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, depthTest: false, side: THREE.DoubleSide }),
    );
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 16, 12),
      new THREE.MeshBasicMaterial({ color: YELLOW, depthTest: false }),
    );
    this.ring.renderOrder = this.marker.renderOrder = 8;
    this.ring.visible = this.marker.visible = false;
    scene.add(this.ring, this.marker);
  }

  /** Ring around the held point, filled by `progress` (0…1), facing the head. */
  progress(at: THREE.Vector3, head: THREE.Vector3, progress: number): void {
    this.ring.visible = true;
    this.ring.position.copy(at);
    this.ring.lookAt(head);
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(0.014, 0.019, 40, 1, Math.PI / 2, -Math.PI * 2 * progress);
  }

  mark(p: THREE.Vector3 | null): void {
    this.marker.visible = !!p;
    if (p) this.marker.position.copy(p);
  }
}
