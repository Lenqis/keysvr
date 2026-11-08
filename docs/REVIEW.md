# Self-review rubric (Claude scores each new/changed scene before handoff)

Screenshots: headless Chromium + IWER (Quest 3 emulator), synthetic hands, `npm run shots`.
Score each criterion, total = weighted average → 1–10. Handoff only at ≥ 8/10.

| # | Criterion | Weight |
|---|-----------|--------|
| 1 | Clear for a beginner without explanations: what to do next is obvious | 2 |
| 2 | Notes/lanes readable: it's clear which real key a note flies to | 2 |
| 3 | Nothing blocks hands, keyboard or the next notes | 1.5 |
| 4 | Text and buttons legible in VR (size, contrast, distance) | 1.5 |
| 5 | Visual style consistent (finger colors, glow, palette) | 1 |
| 6 | Smooth: stable FPS in the emulator, no jank | 1 |
| 7 | Logic: automated tests pass (key detection, scoring) | 1 |

Report to the user: total score + 1–3 lines of what was improved.
Not checkable here (user checks on Quest): fit to the real synth, hand-tracking accuracy, mic.
