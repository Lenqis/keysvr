/**
 * Pure keyboard geometry. Everything derives from the calibrated span between
 * the centers of the lowest and highest keys plus the key-count preset —
 * nothing assumes 61 keys.
 *
 * Local keyboard frame (meters): origin = front edge of the lowest key, at the
 * white-key top surface; +x toward the highest key, +y up, +z toward the player.
 */

export interface KeyRange { keyCount: number; lowestMidi: number }

/** Common keyboard sizes; each starts and ends on a white key. */
export const KEY_PRESETS: KeyRange[] = [
  { keyCount: 25, lowestMidi: 48 }, // C3–C5
  { keyCount: 32, lowestMidi: 53 }, // F3–C6
  { keyCount: 37, lowestMidi: 48 }, // C3–C6
  { keyCount: 49, lowestMidi: 36 }, // C2–C6
  { keyCount: 54, lowestMidi: 36 }, // C2–F6
  { keyCount: 61, lowestMidi: 36 }, // C2–C7 (Tesler KB-6150)
  { keyCount: 76, lowestMidi: 28 }, // E1–G7
  { keyCount: 88, lowestMidi: 21 }, // A0–C8
];
export const DEFAULT_PRESET = KEY_PRESETS.find((p) => p.keyCount === 61)!;

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
/** Black key shift from the gap between its white neighbours, in white-key pitches. */
const BLACK_OFFSET: Record<number, number> = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
const NAMES_RU = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const isBlack = (midi: number): boolean => BLACK_PCS.has(((midi % 12) + 12) % 12);
export const noteNameEn = (midi: number): string => `${NAMES_EN[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const noteNameRu = (midi: number): string => NAMES_RU[midi % 12];
/** "до · C4" */
export const noteLabel = (midi: number): string => `${noteNameRu(midi)} · ${noteNameEn(midi)}`;
export const MIDDLE_C = 60;

export interface KeyRect {
  midi: number;
  black: boolean;
  /** center x, width, z range (front zFront > back zBack), top surface y */
  x: number;
  width: number;
  zFront: number;
  zBack: number;
  top: number;
}

export interface KeyboardLayout extends KeyRange {
  pitch: number; // white key spacing
  whiteLength: number;
  keys: KeyRect[];
}

export function whiteCount(range: KeyRange): number {
  let n = 0;
  for (let m = range.lowestMidi; m < range.lowestMidi + range.keyCount; m++) if (!isBlack(m)) n++;
  return n;
}

/**
 * Builds key rectangles. `span` = distance between the centers of the lowest
 * and highest (white) keys, as measured during calibration.
 */
export function buildLayout(range: KeyRange, span: number): KeyboardLayout {
  const whites = whiteCount(range);
  const pitch = span / Math.max(1, whites - 1);
  // Full-size keys: 23.5 mm pitch ↔ 150 mm white length; scale with pitch.
  const whiteLength = pitch * 6.4;
  const blackLength = whiteLength * 0.63;
  const blackHeight = pitch * 0.5; // black tops stand ~12 mm above white tops
  const keys: KeyRect[] = [];
  let w = -1;
  for (let m = range.lowestMidi; m < range.lowestMidi + range.keyCount; m++) {
    if (!isBlack(m)) {
      w++;
      keys.push({ midi: m, black: false, x: w * pitch, width: pitch * 0.94, zFront: 0, zBack: -whiteLength, top: 0 });
    } else {
      const x = (w + 0.5 + BLACK_OFFSET[m % 12]) * pitch;
      keys.push({ midi: m, black: true, x, width: pitch * 0.55, zFront: -whiteLength + blackLength, zBack: -whiteLength, top: blackHeight });
    }
  }
  return { ...range, pitch, whiteLength, keys };
}

/** Key under a point given in keyboard-local coordinates (black keys win), or null. */
export function keyAt(layout: KeyboardLayout, x: number, z: number): KeyRect | null {
  let white: KeyRect | null = null;
  for (const k of layout.keys) {
    if (z > k.zFront + 0.01 || z < k.zBack) continue; // 1 cm grace in front of the keys
    if (Math.abs(x - k.x) > (k.black ? k.width / 2 : layout.pitch / 2)) continue;
    if (k.black) return k;
    white = k;
  }
  return white;
}

export function nextPreset(current: KeyRange, dir: 1 | -1): KeyRange {
  const i = KEY_PRESETS.findIndex((p) => p.keyCount === current.keyCount);
  const j = Math.min(KEY_PRESETS.length - 1, Math.max(0, (i < 0 ? 5 : i) + dir));
  return KEY_PRESETS[j];
}
