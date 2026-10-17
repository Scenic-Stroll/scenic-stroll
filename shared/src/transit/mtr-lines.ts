/**
 * Small helpers about MTR lines for live arrivals (multimodal step 3): which lines stop at a
 * station, which trains go our way, and how to recognise an MTR ride planned by Google.
 * Kept apart from the stop list so the Edge Functions stay small.
 */
import { MTR_LINES, MTR_STATIONS } from './mtr-data.ts';

const codeOf = new Map<number, string>(MTR_STATIONS.map((s) => [s.id, s.code]));

/** Line codes serving an MTR station code ("KOT" → ["EAL", "KTL"]). */
export function mtrLinesAt(stationCode: string): string[] {
  return [
    ...new Set(
      MTR_LINES.filter((l) =>
        (l.stations as readonly number[]).some((id) => codeOf.get(id) === stationCode),
      ).map((l) => l.code),
    ),
  ].sort();
}

/**
 * Terminus codes of trains that stop at `to` when boarding at `from` on `line`: every station from
 * `to` onwards in the direction of travel, on every branch. A train for Lo Wu or Lok Ma Chau both
 * work for Kowloon Tong → Sha Tin; a Kwun Tong Line train ending at Whampoa doesn't go to Tiu Keng Leng.
 */
export function mtrUsefulDests(line: string, from: string, to: string): string[] {
  const dests = new Set<string>();
  for (const branch of MTR_LINES) {
    if (branch.code !== line) continue;
    const codes = (branch.stations as readonly number[]).map((id) => codeOf.get(id)!);
    const i = codes.indexOf(from);
    const j = codes.indexOf(to);
    if (i < 0 || j < 0 || i === j) continue;
    for (const c of j > i ? codes.slice(j) : codes.slice(0, j + 1)) dests.add(c);
  }
  return [...dests];
}

const plainName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(station|mtr)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Where an MTR ride planned by Google boards, in our terms ("mtr:KOT", line "KTL"), matched by line
 * and station names, so plan-trip can fetch the live next train. null = not an MTR ride we know.
 */
export function mtrBoarding(
  line: string,
  fromName: string,
  toName: string,
): { stop_id: string; route: string; dest_codes: string[] } | null {
  const l = MTR_LINES.find(
    (x) => x.code === line || plainName(x.en) === plainName(line) || x.zh === line,
  );
  const from = MTR_STATIONS.find((s) => plainName(s.en) === plainName(fromName));
  const to = MTR_STATIONS.find((s) => plainName(s.en) === plainName(toName));
  if (!l || !from || !to) return null;
  return {
    stop_id: `mtr:${from.code}`,
    route: l.code,
    dest_codes: mtrUsefulDests(l.code, from.code, to.code),
  };
}
