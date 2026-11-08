/** Player-tunable hand settings, saved on the device. */
const KEY = 'keysvr.tipExtensionMm';
export const TIP_STEPS_MM = [0, 3, 6, 9, 12];

let tipMm = Number(localStorage.getItem(KEY) ?? 6);
if (!TIP_STEPS_MM.includes(tipMm)) tipMm = 6;

/** How far past Quest's tracked tip the real finger end is (mm). */
export function tipExtensionMm(): number {
  return tipMm;
}

export function cycleTipExtension(): number {
  tipMm = TIP_STEPS_MM[(TIP_STEPS_MM.indexOf(tipMm) + 1) % TIP_STEPS_MM.length];
  localStorage.setItem(KEY, String(tipMm));
  return tipMm;
}
