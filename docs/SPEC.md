# KeysVR — product spec

Goal: learn to play favorite songs on my own physical synthesizer using a Meta Quest 3,
without a teacher. Guitar-Hero / Beat-Saber style: falling notes over the real keyboard.

## Flow
1. Main menu: big "Start" button.
2. Calibration of the physical synth in front of me (mixed reality / passthrough):
   - detect number of keys/octaves, position and angle of the keyboard in space;
   - step-by-step popup hints ("press the lowest key", "touch the left edge", …);
   - must be maximally intuitive; save calibration so it's not repeated every time.
3. Song selection + difficulty.
4. Gameplay:
   - background music plays; notes fly/fall toward the exact real keys;
   - virtual gloves on my hands; the finger that should press the next key is highlighted
     (correct, comfortable fingering);
   - hit / miss / timing feedback.
5. Results: score, accuracy, rank F (fail) … D, C, B, A, S (super).
   Max score = whole song played correctly, no missed keys.

## Difficulty
Changes game + song speed. For now the hardest level = original tempo
(e.g. Easy 50%, Normal 75%, Hard 100%) — exact values to confirm.

## Hardware
Tesler KB-6150: 61 keys, no MIDI/USB/Bluetooth. Presses are detected by hand tracking
+ the Quest microphone (checking that the expected note actually sounded).

## Songs (personal use only)
- In-app search: type a song name → find and download MIDI/MusicXML from open web sources.
- Manual import of a file as a fallback.
- Score → note lanes; user chooses which track is the melody (and later, the left hand).
- Background track generated from the same file so it is always in sync.

## Process
- Claude interviews me first, then builds.
- I test on the Quest after each version and send feedback until it's perfect.

