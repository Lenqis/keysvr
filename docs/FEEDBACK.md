# Feedback history

## 2026-11-08 — stage 0 on Quest 3 (user score 6/10)
- [ok] Page opens, passthrough works, "Начало" button presses with a finger.
- [bug] Ring finger press works every other time when the pinky is next to it.
- [bug] Virtual hand drifts off the real hand when shaking hands fast, then returns.
- [bug] Colored fingertip dot is not exactly at the end of the finger (all fingers).

## 2026-11-08 — round 1 fixes re-tested on Quest 3
- [ok] Ring finger presses reliably with the pinky nearby; hand smoothing/fade and fingertip dots accepted.

## 2026-11-08 — stage 1 (calibration + key tester) on Quest 3
- [bug] Calibration step: touching with the LEFT index captured the RIGHT index resting somewhere below.
- [change] "передний край самой правой клавиши" is unclear — needs a clearer instruction/picture.
- [bug] Tester: pressing several keys at once — note labels glitch and stick together.
- [bug] Tester: sometimes the wrong key, sometimes no detection, sometimes detection before the finger actually pressed.

## 2026-11-08 — round 2 fixes on Quest 3
- [ok] Labels of adjacent keys no longer merge.
- [bug] Pressing C with the index sometimes shows a neighbouring key.
- [bug] Fingertip dots sit deeper than the real fingertips when bending; must press "with almost the whole finger" for a key to register.
- [bug] Long note names (соль♯ · G#4) overflow the label box.

## 2026-11-08 — round 3 on Quest 3
- [ok] Overall works well; two-key verify and labels accepted.
- [bug] Tracked fingertip sits on the finger pad, not the finger end → presses with the very tip may not register.
- [bug] Bending one finger alone (ring) — the virtual finger does not bend (stays straight).

## 2026-11-08 — stage 2 (mic) on Quest 3
- [bug] Mic hears nothing: "не услышал" 139 of 139 presses.
- [bug] Key detection ~20% accurate: ring-finger press often not shown; a hovering pinky (cm above the keys) lights a key.
- [bug] Pressing "Калибровка" from the tester: tester buttons stay on the panel and cover the calibration instruction.

## 2026-11-08 — round 5 (continuous mic) on Quest 3
- [bug] Mic picks up room/background sounds and maps them to notes; real key presses heard in < 50 % of cases.
