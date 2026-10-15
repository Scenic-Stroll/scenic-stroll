/**
 * Quick-filter chips on the map ("Sheltered", "Step-free"…) and how each maps onto the tag taxonomy.
 * A route matches a filter if it has ANY of the filter's tags; it matches a set of filters if it
 * matches ALL of them. `verified` checks the route status instead of tags.
 */
import type { Tag } from './taxonomy.ts';

export type FilterKey =
  'sheltered' | 'shaded' | 'step_free' | 'air_conditioned' | 'lifts' | 'food_nearby' | 'verified';

export type FilterInfo = {
  key: FilterKey;
  en: string;
  zh: string;
  icon: string;
  tags: readonly Tag[];
};

export const FILTERS: readonly FilterInfo[] = [
  { key: 'sheltered', en: 'Sheltered', zh: '有蓋', icon: 'umbrella', tags: ['covered', 'indoor'] },
  { key: 'shaded', en: 'Shaded', zh: '有遮蔭', icon: 'weather-sunny-off', tags: ['shaded'] },
  {
    key: 'step_free',
    en: 'Step-free',
    zh: '無梯級',
    icon: 'wheelchair-accessibility',
    tags: ['step_free'],
  },
  {
    key: 'air_conditioned',
    en: 'Air-conditioned',
    zh: '有冷氣',
    icon: 'air-conditioner',
    tags: ['air_conditioned'],
  },
  { key: 'lifts', en: 'Lifts', zh: '升降機', icon: 'elevator', tags: ['lift'] },
  { key: 'food_nearby', en: 'Food nearby', zh: '附近有食肆', icon: 'food', tags: ['food_nearby'] },
  { key: 'verified', en: 'Verified only', zh: '只看已驗證', icon: 'check-decagram', tags: [] },
];

/** Does a route pass every selected filter? */
export function matchesFilters(
  route: { tags: readonly string[]; status: string },
  selected: ReadonlySet<FilterKey>,
): boolean {
  for (const key of selected) {
    if (key === 'verified') {
      if (route.status !== 'verified') return false;
      continue;
    }
    const filter = FILTERS.find((f) => f.key === key);
    if (filter && !filter.tags.some((tag) => route.tags.includes(tag))) return false;
  }
  return true;
}
