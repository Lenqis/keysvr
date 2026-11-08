import * as THREE from 'three';
import { CalibrationFlow } from '../calibration/flow';
import { HandView } from '../hands/handView';
import { Mic } from '../audio/mic';
import { Panel } from '../ui/panel';
import { rayHits } from '../ui/pointer';

const SESSION_INIT: XRSessionInit = {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking', 'anchors'],
};

/** Owns the renderer, scene, input and XR session; the flow drives the screens. */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
  readonly panel = new Panel();
  readonly flow: CalibrationFlow;
  readonly mic = new Mic();
  /** emulator: replaces the real microphone with a synthetic input */
  micSource: ((ctx: AudioContext) => AudioNode) | undefined;
  readonly hands: HandView[] = [];
  private readonly rays: THREE.Group[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly cursor: THREE.Mesh;
  private readonly clock = new THREE.Clock();
  private readonly head = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private session: XRSession | null = null;
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
    this.flow = new CalibrationFlow(this.scene, this.panel, this.mic);
    this.flow.frameSource = () => ({
      frame: this.renderer.xr.getFrame() ?? null,
      refSpace: this.renderer.xr.getReferenceSpace(),
    });

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
    this.rays.push(ctrl);
    // Trigger (controller) or pinch (hand) while aiming at a button → press.
    ctrl.addEventListener('select', () => this.panel.select(ctrl, this.raycaster));
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
    void this.mic.ctx?.resume();
    session.addEventListener('end', () => {
      this.session = null;
      this.onSessionEnd?.();
    });
    await this.renderer.xr.setSession(session);
    this.session = session;
    this.flow.begin(session);
  }

  private frame(): void {
    const xr = this.renderer.xr;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!xr.isPresenting || !this.session) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const cam = xr.getCamera();
    this.head.setFromMatrixPosition(cam.matrixWorld);
    this.forward.set(0, 0, -1).transformDirection(cam.matrixWorld);
    this.scene.updateMatrixWorld();

    const tips = new Map<string, THREE.Vector3>();
    const pressTips = new Map<string, THREE.Vector3>();
    this.hands.forEach((h, i) => {
      h.update(dt);
      if (!h.visible || !h.reliable) return;
      for (const [finger, p] of Object.entries(h.fingertips())) tips.set(`${i}-${finger}`, p);
      for (const [finger, p] of Object.entries(h.pressTips())) pressTips.set(`${i}-${finger}`, p);
    });

    this.flow.update({
      dt, tips, pressTips, head: this.head, forward: this.forward,
      frame: xr.getFrame() ?? null, refSpace: xr.getReferenceSpace(),
    });
    this.panel.group.updateMatrixWorld(true);

    const activeRays = this.rays.filter((r) => r.visible);
    this.cursor.visible = false;
    for (const ray of activeRays) {
      const hit = rayHits(this.raycaster, ray, this.panel.group);
      if (!hit) continue;
      this.cursor.position.copy(hit.point);
      this.cursor.quaternion.copy(this.panel.group.quaternion);
      this.cursor.visible = true;
    }
    this.panel.update(tips, activeRays, this.raycaster);
    this.renderer.render(this.scene, this.camera);
  }
}
