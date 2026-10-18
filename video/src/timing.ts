// Small helpers shared by the components: seconds → frames, decibels → volume,
// which assets exist, and a check that the scenes fill exactly 30 s with no gaps.
import present from './assets-present.json';
import { CAPTIONS, FPS, SCENES, TOTAL_SECONDS } from './video.config';

export const TOTAL_FRAMES = TOTAL_SECONDS * FPS;

export const toFrames = (seconds: number) => Math.round(seconds * FPS);

/** -18 dB → 0.126 (Remotion volumes are 0–1). */
export const dbToVolume = (db: number) => Math.pow(10, db / 20);

export const hasAsset = (file: string | undefined): file is string =>
  !!file && (present as string[]).includes(file);

/** Throws a plain-English error in the Studio if someone edits the timings into a gap or overlap. */
export function checkTimeline() {
  let expected = 0;
  for (const scene of SCENES) {
    if (Math.abs(scene.start - expected) > 1e-9) {
      throw new Error(
        `Scene "${scene.id}" starts at ${scene.start} s but the previous one ends at ${expected} s`,
      );
    }
    if (scene.end <= scene.start) throw new Error(`Scene "${scene.id}" ends before it starts`);
    expected = scene.end;
  }
  if (expected !== TOTAL_SECONDS) {
    throw new Error(`Scenes end at ${expected} s; the video must be exactly ${TOTAL_SECONDS} s`);
  }
  for (const c of CAPTIONS) {
    if (c.start < 0 || c.end > TOTAL_SECONDS || c.end <= c.start) {
      throw new Error(`Caption "${c.en}" has bad times (${c.start}–${c.end} s)`);
    }
  }
}
