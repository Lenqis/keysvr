# Decisions log (one line per decision)

- 2026-11-08 Platform: WebXR (Three.js) in the Quest 3 browser; port to Unity later only if needed.
- 2026-11-08 User env: Windows 10 PC available, Quest developer mode ON (not required for WebXR).
- 2026-11-08 Hosting: GitHub Pages via GitHub Actions on push to main; URL https://lenqis.github.io/keysvr/
- 2026-11-08 Key detection: hand tracking is primary (fingertip dips ~8 mm below key plane + downward velocity); mic confirms expected note (Goertzel on expected pitch); if mic hears nothing, accept the hand result (mode A).
- 2026-11-08 Background track never contains the melody track, so a melody note on the mic comes from the synth.
- 2026-11-08 First prototype after stage 0: "key tester" (calibrate → press any key → key highlights + note name + hand/mic indicators).
- 2026-11-08 Song sources: in-app search via a free Cloudflare Worker proxy (CORS) over BitMidi, FreeMIDI, MidiWorld, MuseScore (if accessible without login); manual file import as fallback. Search is in MVP.
- 2026-11-08 MVP: menu → calibration (saved) → import/search MIDI → choose melody track → notes for right hand → 3 speeds → score + rank. Later: fingering highlight, left hand, nicer gloves, stats, practice (wait) mode.
- 2026-11-08 Calibration: touch leftmost key, then rightmost key, then press middle C to verify; show grid over the real synth; nudge slider; save; next launch = "Confirm". Default 61 keys, user can change.
- 2026-11-08 Notes visual: Guitar-Hero style — notes fly toward the player along lanes ending at the exact real keys.
- 2026-11-08 Hands: semi-transparent glowing gloves; note colors = finger colors.
- 2026-11-08 Ranks by accuracy: S ≥95% (and zero misses), A ≥90, B ≥80, C ≥70, D ≥60, F <60.
- 2026-11-08 Speeds: Easy 50%, Normal 75%, Hard 100% (original tempo).
- 2026-11-08 Self-review loop: Claude screenshots every new scene in headless Chromium + IWER (Quest 3 emulator, synthetic hands), scores it 1–10 on a fixed rubric (docs/REVIEW.md) and iterates until ≥8/10 before handing to the user.
- 2026-11-08 Planned "record mode": user records hand tracking + mic to a file, Claude replays it in the emulator.
- INTERVIEW DONE
- 2026-11-08 Three.js skills: upstream repo has skills/threejs-* (no .claude/skills/threejs); copied all except react-three-fiber into .claude/skills/.
- 2026-11-08 Stage 0 self-review: 8.4/10 (panel, poke button, finger-colored hand skeleton; 16 draw calls).
