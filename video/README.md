# Demo video (30 s, Remotion)

Builds the 30-second pitch video from our screen recordings. It is separate from the app, not
an npm workspace, so install it once on its own:

```bash
cd video
npm install
npm run preview   # Remotion Studio in the browser: scrub, tweak, toggle showZh (Chinese lines)
npm run render    # out/scenic-stroll-30s-vertical.mp4 and out/scenic-stroll-30s-landscape.mp4
```

## Add the footage

Drop these into `video/assets/` (git-ignored: they're large, and music may be licensed).
Anything missing shows a labelled placeholder saying what to film, so you can render at any time.

| File                                             | What it is                                                    |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `ai_shot1.mp4`, `ai_shot2a.mp4`, `ai_shot2b.mp4` | Problem shots (AI-generated or filmed at Kowloon Tong), 0–6 s |
| `R1.mp4` … `R6.mp4`                              | Phone screen recordings of the real app, one per scene        |
| `logo.png`                                       | Square logo (optional; text is used without it)               |
| `music.mp3`, `voiceover.mp3`                     | Royalty-free music and the voiceover (both optional)          |

## Change anything

Timings, captions (English + Traditional Chinese), which file plays where, trims, speed-ups and
the green highlight positions all live in **`src/video.config.ts`**. The Studio refreshes as you
save. If the scenes stop adding up to exactly 30 s, the Studio shows an error naming the scene.

Before rendering the final version:

- Replace the R2 caption with the numbers the Cool route card really shows (it's marked TODO).
- Every number on screen must match the app or `eval/results/multimodal-2026-10-18.md`.
- Move the callouts (`CALLOUTS`) onto the right buttons once the real recordings are in.

## How to record the app scenes

- **R1:** Profile → Diagnostics → Simulate weather: **Heat**, then open the Map so the "Now" card slides in.
- **R2:** Kowloon Tong Exit C1 → Mong Man-wai Building, tap **Cool**.
- **R5:** Exit A1 → MMW, the All tab, then turn on **Simulate rush hour** (Diagnostics) and show the car time jump.
- **R6:** a teammate shares their location from a second phone; open their profile ("Getting there" times),
  then **Route to friend**. The app has no meetup card or simulated friends.
- Light theme, Do Not Disturb on, phone's own screen recorder.
