# KeysVR — VR synth trainer for Meta Quest 3

Talk to the user in Russian. Code, comments, commits in English.
Full product spec: docs/SPEC.md (read only when needed, don't re-read every turn).
Decisions log: docs/DECISIONS.md (append one line per decision).
Feedback history: docs/FEEDBACK.md.

## Stack
WebXR in Quest 3 browser: Three.js + Vite + TypeScript. Passthrough = immersive-ar,
hands = WebXR Hand Input, mic = getUserMedia + Web Audio (Goertzel on expected notes).
MIDI parsing @tonejs/midi; background synth via Web Audio. Song search proxy = Cloudflare Worker.
Self-review: Playwright + headless Chromium + IWER (Meta Quest 3 emulator, synthetic hands).
Unit tests: Vitest.

## Hardware (fixed)
Synth: Tesler KB-6150 — 61 keys (C2–C7, 5 octaves), 8-voice polyphony, NO MIDI/USB/Bluetooth.
Key detection = hand tracking (fingertip over calibrated key grid, dips below key plane)
+ Quest microphone pitch check (we know the expected notes, so only verify they sound).
Calibration: user touches leftmost & rightmost key → build 61-key grid; allow other key counts.

## Commands
(planned, created in stage 0)
npm install · npm run dev · npm run build · npm test · npm run shots (screenshots → shots/)
Quest: open https://lenqis.github.io/keysvr/ in the Quest browser after the PR is merged.

## Environment
User works in Claude Code on the web (cloud sessions, GitHub repo). No local PC dev server.
Testing = GitHub Pages (HTTPS, needed for WebXR) deployed by GitHub Actions on push to main.
User merges each PR, then opens https://lenqis.github.io/keysvr/ in the Quest browser.
Never commit downloaded songs to the repo (public repo); songs live in the browser storage.

## Rules
- Phase 1 (interview) is not done until docs/DECISIONS.md has "INTERVIEW DONE". Until then: ask, don't code.
- Ask questions in batches of 3–5, with options and a recommended choice. Max 4 rounds.
- Build in small vertical slices; each slice must be testable on the Quest by the user.
- After each slice: tell the user in 3–6 short lines what to test and how. No long reports.
- Don't re-read whole files; use grep / read line ranges. Don't print large code into chat.
- Keep modules small (<300 lines). Folder layout: src/{calibration,game,hands,midi,songs,ui,audio}.
- Songs (personal use only, nothing is published): in-app search + download of MIDI/MusicXML
  from open web sources, plus manual file import. Let the user pick the melody track.
  Background track is synthesized from the same file so it stays in sync.
- Never hardcode keyboard size: everything derives from calibration (lowest/highest key).
- Self-review before handoff: screenshot every new/changed scene in IWER, score it 1–10 by
  docs/REVIEW.md rubric, iterate until ≥8/10. Only then give it to the user.
- Update this file's Stack/Commands sections when they change. Keep this file under 60 lines.
