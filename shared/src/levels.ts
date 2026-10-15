/**
 * Points, levels and badges (inspired by community map guides). Pure functions so the Profile,
 * Friends leaderboard and server can all agree on the numbers.
 *
 * Points (build prompt §5 Phase 5): +10 per route logged, +5 per description, +5 per verified walk,
 * +20 when one of your routes becomes verified.
 */

export const POINTS = {
  route: 10,
  description: 5,
  verifiedWalk: 5,
  routeVerified: 20,
} as const;

export type Activity = {
  routes: number;
  descriptions: number;
  verifiedWalks: number;
  routesVerified: number;
};

export function pointsFor(a: Activity): number {
  return (
    a.routes * POINTS.route +
    a.descriptions * POINTS.description +
    a.verifiedWalks * POINTS.verifiedWalk +
    a.routesVerified * POINTS.routeVerified
  );
}

export const LEVELS = [
  { name: 'Newcomer', zh: '新手', min: 0 },
  { name: 'Explorer', zh: '探索者', min: 50 },
  { name: 'Local Guide', zh: '在地嚮導', min: 150 },
  { name: 'Route Master', zh: '路線大師', min: 400 },
  { name: 'Legend', zh: '傳奇', min: 1000 },
] as const;

export type LevelInfo = {
  /** 1-based level number, for "Level 3". */
  number: number;
  name: string;
  zh: string;
  /** Points needed for the next level, or null at the top level. */
  nextAt: number | null;
  pointsToNext: number | null;
  /** 0–1 progress from this level's minimum to the next level. 1 at the top level. */
  progress: number;
};

export function levelFor(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points));
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i]!.min) index = i;
  const level = LEVELS[index]!;
  const next = LEVELS[index + 1];
  return {
    number: index + 1,
    name: level.name,
    zh: level.zh,
    nextAt: next ? next.min : null,
    pointsToNext: next ? next.min - p : null,
    progress: next ? (p - level.min) / (next.min - level.min) : 1,
  };
}

// ---- badges ------------------------------------------------------------------------------

export type BadgeInput = {
  routesLogged: number;
  /** Lift checkpoints across all your routes. */
  liftCheckpoints: number;
  /** Your routes that go indoors (have an entrance checkpoint, or a covered/indoor tag). */
  shelteredRoutes: number;
  /** Your routes that other walkers have verified. */
  routesVerified: number;
  /** Your rank this week among you + friends (1 = top), or null if not ranked. */
  weeklyRank: number | null;
};

export type Badge = {
  id: 'first_route' | 'shelter_scout' | 'lift_finder' | 'verified_contributor' | 'top_contributor';
  name: string;
  zh: string;
  icon: string;
  howToEarn: string;
  earned: boolean;
};

export function badgesFor(b: BadgeInput): Badge[] {
  return [
    {
      id: 'first_route',
      name: 'First Route',
      zh: '第一條路線',
      icon: 'flag-variant',
      howToEarn: 'Record and upload your first route.',
      earned: b.routesLogged >= 1,
    },
    {
      id: 'shelter_scout',
      name: 'Shelter Scout',
      zh: '避雨達人',
      icon: 'umbrella',
      howToEarn: 'Log 3 routes that go indoors or under cover (add an entrance checkpoint).',
      earned: b.shelteredRoutes >= 3,
    },
    {
      id: 'lift_finder',
      name: 'Lift Finder',
      zh: '升降機獵人',
      icon: 'elevator',
      howToEarn: 'Add 3 lift checkpoints to your routes.',
      earned: b.liftCheckpoints >= 3,
    },
    {
      id: 'verified_contributor',
      name: 'Verified Contributor',
      zh: '認證貢獻者',
      icon: 'check-decagram',
      howToEarn: 'Have one of your routes verified by two other walkers.',
      earned: b.routesVerified >= 1,
    },
    {
      id: 'top_contributor',
      name: 'Top Contributor',
      zh: '本週之星',
      icon: 'trophy',
      howToEarn: 'Earn the most points this week among you and your friends.',
      earned: b.weeklyRank === 1,
    },
  ];
}
