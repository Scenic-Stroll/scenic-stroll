/**
 * The fixed tag vocabulary for Scenic Stroll.
 *
 * This is the ONLY list of tags the app, the database and the LLM may use.
 * If you add a tag here you must also:
 *   1. add it to the LLM prompt few-shots if it needs examples (supabase/functions/tag-route/prompt.ts)
 *   2. add a label in both languages below
 *
 * `icon` is a MaterialCommunityIcons name (from @expo/vector-icons, bundled in Expo Go).
 */

export const TAG_GROUPS = [
  'access',
  'shelter',
  'shade',
  'elevation',
  'structure',
  'experience',
  'caution',
] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

export type TagInfo = {
  group: TagGroup;
  en: string;
  /** Traditional Chinese (Hong Kong usage) */
  zh: string;
  icon: string;
};

// `satisfies` checks every entry has the right shape while keeping the exact keys as a type.
export const TAXONOMY = {
  // access
  lift: { group: 'access', en: 'Lift', zh: '升降機', icon: 'elevator' },
  escalator: { group: 'access', en: 'Escalator', zh: '扶手電梯', icon: 'escalator' },
  stairs: { group: 'access', en: 'Stairs', zh: '樓梯', icon: 'stairs' },
  ramp: { group: 'access', en: 'Ramp', zh: '斜道', icon: 'slope-uphill' },
  step_free: { group: 'access', en: 'Step-free', zh: '無梯級', icon: 'wheelchair-accessibility' },
  // shelter
  covered: { group: 'shelter', en: 'Covered', zh: '有蓋', icon: 'umbrella' },
  indoor: { group: 'shelter', en: 'Indoor', zh: '室內', icon: 'office-building' },
  air_conditioned: {
    group: 'shelter',
    en: 'Air-conditioned',
    zh: '有冷氣',
    icon: 'air-conditioner',
  },
  unsheltered: { group: 'shelter', en: 'Unsheltered', zh: '無遮蓋', icon: 'weather-pouring' },
  // shade
  shaded: { group: 'shade', en: 'Shaded', zh: '有遮蔭', icon: 'weather-sunny-off' },
  partly_shaded: {
    group: 'shade',
    en: 'Partly shaded',
    zh: '部分遮蔭',
    icon: 'weather-partly-cloudy',
  },
  sunny: { group: 'shade', en: 'Sunny', zh: '日曬', icon: 'weather-sunny' },
  // elevation
  flat: { group: 'elevation', en: 'Flat', zh: '平路', icon: 'trending-neutral' },
  uphill: { group: 'elevation', en: 'Uphill', zh: '上坡', icon: 'trending-up' },
  downhill: { group: 'elevation', en: 'Downhill', zh: '下坡', icon: 'trending-down' },
  steep: { group: 'elevation', en: 'Steep', zh: '陡坡', icon: 'image-filter-hdr' },
  // structure
  mall_route: { group: 'structure', en: 'Through a mall', zh: '經商場', icon: 'shopping' },
  footbridge: { group: 'structure', en: 'Footbridge', zh: '行人天橋', icon: 'bridge' },
  underpass: { group: 'structure', en: 'Underpass', zh: '行人隧道', icon: 'tunnel' },
  through_building: {
    group: 'structure',
    en: 'Through a building',
    zh: '穿過大廈',
    icon: 'domain',
  },
  // experience
  scenic: { group: 'experience', en: 'Scenic', zh: '景色優美', icon: 'camera' },
  quiet: { group: 'experience', en: 'Quiet', zh: '寧靜', icon: 'volume-off' },
  crowded: { group: 'experience', en: 'Crowded', zh: '擠迫', icon: 'account-group' },
  food_nearby: { group: 'experience', en: 'Food nearby', zh: '附近有食肆', icon: 'food' },
  green_space: { group: 'experience', en: 'Green space', zh: '綠化空間', icon: 'tree' },
  heritage: { group: 'experience', en: 'Heritage', zh: '歷史建築', icon: 'bank' },
  // caution
  long_wait_crossing: {
    group: 'caution',
    en: 'Long wait at crossing',
    zh: '過路等候久',
    icon: 'traffic-light',
  },
  narrow: { group: 'caution', en: 'Narrow', zh: '路窄', icon: 'arrow-collapse-horizontal' },
  closes_at_night: {
    group: 'caution',
    en: 'Closes at night',
    zh: '夜間關閉',
    icon: 'weather-night',
  },
  construction: { group: 'caution', en: 'Construction', zh: '施工中', icon: 'hard-hat' },
} as const satisfies Record<string, TagInfo>;

export type Tag = keyof typeof TAXONOMY;

/** All tag ids as a non-empty tuple (zod's z.enum needs this shape). */
export const TAGS = Object.keys(TAXONOMY) as [Tag, ...Tag[]];

export function isTag(value: string): value is Tag {
  return Object.prototype.hasOwnProperty.call(TAXONOMY, value);
}

export function tagsInGroup(group: TagGroup): Tag[] {
  return TAGS.filter((t) => TAXONOMY[t].group === group);
}
