import * as THREE from 'three';
import type { KeyRange } from './keyboardModel';
import type { KeyboardCalibration, Nudge } from './keyboardFrame';

const KEY = 'keysvr.calibration.v1';

interface Saved {
  range: KeyRange;
  span: number;
  nudge: Nudge;
  /** base matrix in the session's local-floor space (fallback without anchors) */
  matrix: number[];
  /** persistent anchor UUID placed at the base pose (Quest browser) */
  anchor?: string;
}

type PersistSession = XRSession & {
  restorePersistentAnchor?: (uuid: string) => Promise<XRAnchor>;
  deletePersistentAnchor?: (uuid: string) => Promise<void>;
};
type PersistAnchor = XRAnchor & { requestPersistentHandle?: () => Promise<string> };

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  localStorage.removeItem(KEY);
}

/**
 * Saves the calibration. Tries to drop a persistent anchor at the keyboard
 * origin so the grid comes back in the same real-world spot next session.
 */
export async function saveCalibration(
  cal: KeyboardCalibration,
  frame: XRFrame | null,
  refSpace: XRReferenceSpace | null,
): Promise<'anchor' | 'local'> {
  const prev = loadSaved();
  const data: Saved = {
    range: cal.range,
    span: cal.span,
    nudge: { ...cal.nudge },
    matrix: cal.base.toArray(),
  };
  let mode: 'anchor' | 'local' = 'local';
  try {
    if (frame?.createAnchor && refSpace) {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      cal.base.decompose(p, q, s);
      const anchor = (await frame.createAnchor(
        new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }),
        refSpace,
      )) as PersistAnchor | undefined;
      const handle = await anchor?.requestPersistentHandle?.();
      if (handle) {
        data.anchor = handle;
        mode = 'anchor';
        const session = frame.session as PersistSession;
        if (prev?.anchor && prev.anchor !== handle) await session.deletePersistentAnchor?.(prev.anchor).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Persistent anchor failed, saving local pose only', err);
  }
  localStorage.setItem(KEY, JSON.stringify(data));
  return mode;
}

/** Restores the persistent anchor, if any. Its pose is the keyboard base pose. */
export async function restoreAnchor(session: XRSession, saved: Saved): Promise<XRAnchor | null> {
  const s = session as PersistSession;
  if (!saved.anchor || !s.restorePersistentAnchor) return null;
  try {
    return await s.restorePersistentAnchor(saved.anchor);
  } catch (err) {
    console.warn('Could not restore anchor', err);
    return null;
  }
}

export function savedMatrix(saved: Saved): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(saved.matrix);
}

/** Current anchor pose as a matrix, or null while not tracked. */
export function anchorMatrix(frame: XRFrame, anchor: XRAnchor, refSpace: XRReferenceSpace): THREE.Matrix4 | null {
  const pose = frame.getPose(anchor.anchorSpace, refSpace);
  return pose ? new THREE.Matrix4().fromArray(pose.transform.matrix) : null;
}

export type { Saved };
