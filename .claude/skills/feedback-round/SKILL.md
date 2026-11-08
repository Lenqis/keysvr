---
name: feedback-round
description: Use when the user reports test results of the VR game (what works, what is broken, what to change).
---

1. Append the user's feedback to docs/FEEDBACK.md as a short dated list:
   `- [bug|change|ok] one line`.
2. Group items: bugs first, then changes. If something is unclear, ask max 2 questions, then stop.
3. Fix items one by one; touch only the files involved (grep first, read line ranges).
4. Don't break items marked [ok] — re-check them if you touched related code.
5. Run build/tests. Reply in Russian, max 8 lines: what was fixed, what to re-test on the Quest,
   what is still open.

