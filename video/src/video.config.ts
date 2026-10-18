// Everything a non-coder may want to change lives in this one file: timings, captions,
// which file plays where, and where the highlight circles go. Times are in seconds.
// After editing, the Remotion Studio preview (npm run preview) updates by itself.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_SECONDS = 30;

export const COLORS = {
  // App green from app/src/theme/tokens.ts. White text needs the darker `green` for contrast
  // (4.9:1); the brighter brief green `accent` is only used for outlines and highlights.
  green: '#14822A',
  accent: '#1BA136',
  light: '#F3F8F3',
  darkPill: 'rgba(0, 0, 0, 0.6)',
};

/** Slide-in length between scenes (frames). The 6.0 s problem → app switch is a hard cut instead. */
export const TRANSITION_FRAMES = 7;
export const HARD_CUT_AT = 6;

export type Scene = {
  id: string;
  start: number;
  end: number;
  /** problem = full-screen footage, app = screen recording in a phone frame, end = end card. */
  kind: 'problem' | 'app' | 'end';
  /** File name in video/assets/. Missing files show a labelled placeholder instead. */
  file?: string;
  /** Skip this many seconds at the start of the file. */
  trimStart?: number;
  /** 1 = normal speed. Up to 1.5 if a recording is a bit too long for its slot. */
  speed?: number;
  /** Small logo in the top-left corner. */
  logo?: boolean;
  /** What to film — shown on the placeholder until the real file is added. */
  shot: string;
};

export const SCENES: Scene[] = [
  {
    id: 'ai_shot1',
    start: 0,
    end: 3,
    kind: 'problem',
    file: 'ai_shot1.mp4',
    shot: 'Student leaves an MTR exit into harsh sun, squints at phone',
  },
  {
    id: 'ai_shot2a',
    start: 3,
    end: 4.5,
    kind: 'problem',
    file: 'ai_shot2a.mp4',
    shot: 'POV: straight map line ends at a fence',
  },
  {
    id: 'ai_shot2b',
    start: 4.5,
    end: 6,
    kind: 'problem',
    file: 'ai_shot2b.mp4',
    shot: 'Sudden rain, no cover; people dry under a footbridge',
  },
  {
    id: 'R1',
    start: 6,
    end: 9,
    kind: 'app',
    file: 'R1.mp4',
    logo: true,
    shot: 'Profile → Diagnostics → Simulate weather: Heat. Then Map: the "Now" card slides in',
  },
  {
    id: 'R2',
    start: 9,
    end: 13,
    kind: 'app',
    file: 'R2.mp4',
    shot: 'Exit C1 → MMW: options load, tap Cool, route through Festival Walk',
  },
  {
    id: 'R3',
    start: 13,
    end: 17,
    kind: 'app',
    file: 'R3.mp4',
    shot: 'Record tab: stop, type the Cantonese description, tags pop in',
  },
  {
    id: 'R4',
    start: 17,
    end: 20,
    kind: 'app',
    file: 'R4.mp4',
    shot: 'Route card with Verified badge, tap Step-free',
  },
  {
    id: 'R5',
    start: 20,
    end: 24,
    kind: 'app',
    file: 'R5.mp4',
    shot: 'Exit A1 → MMW, All tab, then Simulate rush hour on (Diagnostics)',
  },
  {
    id: 'R6',
    start: 24,
    end: 27,
    kind: 'app',
    file: 'R6.mp4',
    shot: 'Friend profile (teammate sharing location): Getting there times → Route to friend',
  },
  { id: 'end', start: 27, end: 30, kind: 'end', shot: 'End card' },
];

export type Caption = { start: number; end: number; en: string; zh: string };

// Keep every number identical to what the app or eval/results/multimodal-2026-10-18.md shows.
export const CAPTIONS: Caption[] = [
  { start: 0, end: 3, en: '33°C. The map says: walk this way.', zh: '33°C，地圖話：行呢邊。' },
  {
    start: 3,
    end: 6,
    en: 'Unshaded. Unsheltered. Dead ends.',
    zh: '冇遮蔭、冇上蓋、行唔通。',
  },
  {
    start: 9,
    end: 13,
    // TODO before rendering: copy the real numbers from the Cool route card in R2.
    en: 'Cooler route · shaded & air-conditioned',
    zh: '更涼快路線 · 有遮蔭、有冷氣',
  },
  {
    start: 13,
    end: 17,
    en: 'Locals log routes → AI turns words into tags',
    zh: '街坊記錄路線 → AI 將文字變成標籤',
  },
  {
    start: 17,
    end: 20,
    en: 'Verified by the community · Step-free filter',
    zh: '社區驗證 · 無障礙篩選',
  },
  {
    start: 20,
    end: 24,
    // Exit A1 → MMW at 18:00 (eval): walk 9 min, car 10, taxi 13.
    en: 'Walk 9 min · Car 10 · Taxi 13. Walking often wins.',
    zh: '步行 9 分鐘 · 私家車 10 · 的士 13，行路好多時更快。',
  },
  { start: 24, end: 27, en: 'Walk together', zh: '一齊行' },
];

export type Callout = {
  scene: string;
  /** Seconds from the start of the whole video. */
  at: number;
  duration: number;
  shape: 'circle' | 'box';
  /** Centre of the highlight, as a fraction of the phone screen (0 = left/top, 1 = right/bottom). */
  x: number;
  y: number;
  /** Size as a fraction of the phone screen width (circle: diameter; box: width × height). */
  w: number;
  h: number;
};

// Adjust x / y after watching the preview with the real recordings.
export const CALLOUTS: Callout[] = [
  { scene: 'R2', at: 9.5, duration: 1.5, shape: 'circle', x: 0.62, y: 0.55, w: 0.22, h: 0.22 },
  { scene: 'R5', at: 21, duration: 2, shape: 'box', x: 0.5, y: 0.6, w: 0.9, h: 0.14 },
];

export const AUDIO = {
  music: 'music.mp3',
  voiceover: 'voiceover.mp3',
  musicDb: -18,
  /** Music level while the voiceover file exists. */
  musicUnderVoiceDb: -24,
  fadeOutSeconds: 1,
};

export const END_CARD = {
  tagline: 'Walk the way locals do.',
  name: 'Scenic Stroll',
  sdgs: 'SDG 3 · SDG 11 · SDG 13',
  event: '2026 Generative AI Hackathon for the SDGs',
};

export const LOGO_FILE = 'logo.png';
