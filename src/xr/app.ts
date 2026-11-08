import * as THREE from 'three';
import { HandView } from '../hands/handView';
import { WelcomePanel } from '../ui/welcomePanel';
import { PokeTarget, rayHits } from '../ui/pointer';

const SESSION_INIT: XRSessionInit = {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking'],
};

/** Owns the renderer, scene and the XR session for the stage-0 welcome scene. */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
  readonly panel = new WelcomePanel();
  private readonly hands: HandView[] = [];
  private readonly rays: { ctrl: THREE.Group; line: THREE.Line }[] = [];
  private readonly poke: PokeTarget;
  private readonly raycaster = new THREE.Raycaster();
  private readonly cursor: THREE.Mesh;
  private needsPlacement = true;
  onSessionEnd: (() => void) | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0); // transparent → passthrough shows through
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    document.body.appendChild(this.renderer.domElement);

    this.scene.add(this.panel.group);
    this.poke = new PokeTarget(this.panel.button);

    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.004, 0.007, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    for (let i = 0; i < 2; i++) this.setupInput(i);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupInput(i: number): void {
    const xr = this.renderer.xr;
    const hand = xr.getHand(i);
    this.scene.add(hand);
    const view = new HandView(hand);
    this.hands.push(view);
    this.scene.add(view.object);

    const ctrl = xr.getController(i);
    this.scene.add(ctrl);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x7ff5ea, transparent: true, opacity: 0.6 }),
    );
    line.scale.z = 2;
    line.visible = false;
    ctrl.add(line);
    this.rays.push({ ctrl, line });
    // Trigger (controller) or pinch (hand) while aiming at the button → press.
    ctrl.addEventListener('select', () => {
      if (rayHits(this.raycaster, ctrl, this.panel.button.group)) this.panel.button.press();
    });
    ctrl.addEventListener('connected', (e) => {
      // Hands get no visible ray: poking with a finger is the main hand interaction.
      line.visible = !(e as unknown as { data: XRInputSource }).data.hand;
    });
    ctrl.addEventListener('disconnected', () => { line.visible = false; });
  }

  static async isSupported(): Promise<boolean> {
    return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'));
  }

  async start(): Promise<void> {
    const session = await navigator.xr!.requestSession('immersive-ar', SESSION_INIT);
    session.addEventListener('end', () => this.onSessionEnd?.());
    this.needsPlacement = true;
    this.panel.setMode('welcome');
    await this.renderer.xr.setSession(session);
  }

  private frame(): void {
    const xr = this.renderer.xr;
    if (xr.isPresenting && this.needsPlacement) {
      const cam = xr.getCamera();
      const head = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      // Wait for a real head pose (y > 0.3 m above the floor).
      if (head.y > 0.3) {
        const fwd = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
        this.panel.placeInFrontOf(head, fwd);
        this.needsPlacement = false;
      }
    }
    this.scene.updateMatrixWorld();

    const tips: THREE.Vector3[] = [];
    for (const h of this.hands) {
      h.update();
      if (h.visible) tips.push(...Object.values(h.fingertips()));
    }

    let rayHover = false;
    this.cursor.visible = false;
    for (const { ctrl } of this.rays) {
      if (!ctrl.visible) continue;
      const hit = rayHits(this.raycaster, ctrl, this.panel.group);
      if (!hit) continue;
      this.cursor.position.copy(hit.point);
      this.cursor.quaternion.copy(this.panel.group.quaternion);
      this.cursor.visible = true;
      if (rayHits(this.raycaster, ctrl, this.panel.button.group)) rayHover = true;
    }
    this.poke.update(tips, rayHover);
    this.renderer.render(this.scene, this.camera);
  }
}
