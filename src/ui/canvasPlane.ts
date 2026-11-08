import * as THREE from 'three';

export const FONT = "system-ui, Roboto, 'Noto Sans', 'DejaVu Sans', Arial, sans-serif";

/** A flat mesh whose texture is drawn with the 2D canvas API (used for VR text/UI). */
export class CanvasPlane {
  readonly mesh: THREE.Mesh;
  readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;

  constructor(
    readonly widthM: number,
    readonly heightM: number,
    pxPerM = 2400,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthM * pxPerM);
    canvas.height = Math.round(heightM * pxPerM);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.02, // fully transparent corners don't occlude
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), material);
  }

  get w(): number { return this.ctx.canvas.width; }
  get h(): number { return this.ctx.canvas.height; }

  /** Clear, call the draw callback, upload the texture. */
  draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
    fn(this.ctx, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, sizePx: number, color: string, weight = 600,
): void {
  ctx.font = `${weight} ${sizePx}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
