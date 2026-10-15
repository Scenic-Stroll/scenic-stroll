/** Human-friendly walking time and distance, e.g. "6 min", "450 m", "1.2 km". */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '–';
  const rounded = Math.round(meters / 10) * 10; // walking precision: nearest 10 m
  if (rounded < 1000) return `${rounded} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** "just now", "2 min ago", "1 h ago". `when` is an ISO date or a millisecond timestamp. */
export function agoLabel(when: string | number, now: number = Date.now()): string {
  const ms = now - (typeof when === 'number' ? when : new Date(when).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}
