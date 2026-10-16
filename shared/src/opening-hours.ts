/**
 * Is a walkway open at a given moment? Reads the small subset of OSM opening-hours syntax our walking
 * graph uses (see openingHoursFrom3dpn in graph-build.ts):
 *
 *   "Mo-Su 07:00-24:00"                        open 7 am to midnight every day
 *   "Mo-Fr 08:00-19:30; Sa 08:00-13:00"        weekdays + Saturday morning, closed Sunday
 *   "Mo-Su 00:00-24:00; We 09:00-11:00 off"    always open except Wednesday 9–11 (lift maintenance)
 *
 * Times are Hong Kong time. Rules for public holidays ("PH") are skipped: we don't know the holiday
 * calendar. Hours we can't read count as "open", so odd data never strands a route.
 */

export type OpeningRule = {
  /** 0 = Sunday … 6 = Saturday (like Date.getUTCDay). */
  days: Set<number>;
  /** Minutes after midnight. `to` may be 1440 (24:00). If from > to, the range runs past midnight. */
  from: number;
  to: number;
  off: boolean;
};

const DAY_INDEX: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };

function parseDays(text: string): Set<number> | null {
  const days = new Set<number>();
  for (const part of text.split(',')) {
    const [a, b] = part.split('-');
    const start = DAY_INDEX[a ?? ''];
    if (start === undefined) return null; // "PH" or something we don't understand
    const end = b === undefined ? start : DAY_INDEX[b];
    if (end === undefined) return null;
    // Mo-Su wraps through the week: 1,2,3,4,5,6,0
    for (let d = start, n = 0; n < 7; d = (d + 1) % 7, n++) {
      days.add(d);
      if (d === end) break;
    }
  }
  return days;
}

function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= 1440 ? minutes : null;
}

/** Parses the rules we understand; anything else is skipped. */
export function parseOpeningHours(text: string): OpeningRule[] {
  const rules: OpeningRule[] = [];
  for (const raw of text.split(';')) {
    const parts = raw.trim().split(/\s+/);
    const off = parts.at(-1) === 'off';
    const [dayText, range] = parts;
    if (!dayText || !range) continue;
    const days = parseDays(dayText);
    const [fromText, toText] = range.split('-');
    const from = parseTime(fromText ?? '');
    const to = parseTime(toText ?? '');
    if (!days || from === null || to === null) continue;
    rules.push({ days, from, to, off });
  }
  return rules;
}

/** Day of week (0 = Sunday) and minute of day in Hong Kong (UTC+8, no daylight saving). */
export function hongKongTime(date: Date): { day: number; minute: number } {
  const hk = new Date(date.getTime() + 8 * 60 * 60_000);
  return { day: hk.getUTCDay(), minute: hk.getUTCHours() * 60 + hk.getUTCMinutes() };
}

function covers(rule: OpeningRule, day: number, minute: number): boolean {
  if (rule.from <= rule.to) return rule.days.has(day) && minute >= rule.from && minute < rule.to;
  // Past midnight, e.g. Fr 22:00-02:00: Friday from 22:00, or Saturday before 02:00.
  return (
    (rule.days.has(day) && minute >= rule.from) ||
    (rule.days.has((day + 6) % 7) && minute < rule.to)
  );
}

/** null / empty hours = always open. Unparseable hours also count as open (never strand a route). */
export function isOpenAt(hours: string | null, date: Date): boolean {
  if (!hours) return true;
  return openUnder(parseOpeningHours(hours), date);
}

/** isOpenAt for rules that are already parsed. */
function openUnder(rules: OpeningRule[], date: Date): boolean {
  const openRules = rules.filter((r) => !r.off);
  if (rules.length === 0) return true;
  const { day, minute } = hongKongTime(date);
  const open = openRules.length === 0 || openRules.some((r) => covers(r, day, minute));
  return open && !rules.some((r) => r.off && covers(r, day, minute));
}

/**
 * When a walkway that is open at `from` next closes, within the next `withinMin` minutes (default
 * 24 hours); null = it stays open that long (or is closed already). Checked minute by minute, so
 * "Mo-Su 07:00-24:00" at 23:40 gives midnight. Used to warn "Festival Walk closes at 22:00 — you'd
 * pass at 21:52".
 */
export function closesAt(hours: string | null, from: Date, withinMin = 24 * 60): Date | null {
  if (!hours) return null;
  const rules = parseOpeningHours(hours); // once, not once per minute
  if (!openUnder(rules, from)) return null;
  // Start at the next whole minute, so the answer is a round time like 22:00.
  const start = Math.ceil(from.getTime() / 60_000) * 60_000;
  for (let m = 0; m <= withinMin; m++) {
    const t = new Date(start + m * 60_000);
    if (!openUnder(rules, t)) return t;
  }
  return null;
}
