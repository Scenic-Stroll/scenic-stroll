/**
 * Floor names as Hong Kong buildings use them (B2, LG1, G, UG, L1, 3/F…), for the map's floor
 * selector. Floors come from community checkpoints ("lift UG → L2"), never invented.
 */

/** Uppercase, no spaces: " ug " → "UG", "3/f" → "3/F". Empty → null. */
export function normalizeFloor(floor: string | null | undefined): string | null {
  const f = floor?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  return f.length > 0 ? f : null;
}

/** Sort key: basements lowest, then lower ground, ground, upper ground, then numbered floors up. */
function floorRank(floor: string): number {
  let m: RegExpMatchArray | null;
  if ((m = floor.match(/^B(\d+)$/))) return -100 - Number(m[1]); // B2 below B1
  if ((m = floor.match(/^LG(\d*)$/))) return -10 - (m[1] ? Number(m[1]) : 0); // LG2 below LG1
  if (floor === 'G' || floor === 'GF' || floor === 'G/F') return 0;
  if (floor === 'UG') return 0.5;
  if ((m = floor.match(/^(?:L|F)?(\d+)(?:\/F|F)?$/))) return Number(m[1]); // L1, 1/F, 1F, F1, 1
  return 1000; // unknown names (e.g. "PODIUM") go on top, sorted alphabetically among themselves
}

export function sortFloors(floors: Iterable<string>): string[] {
  return [...new Set(floors)].sort((a, b) => floorRank(a) - floorRank(b) || a.localeCompare(b));
}

/** Distinct floors mentioned by checkpoints, lowest first. */
export function floorsFromCheckpoints(
  checkpoints: readonly { floor_from: string | null; floor_to: string | null }[],
): string[] {
  const floors: string[] = [];
  for (const c of checkpoints) {
    for (const f of [normalizeFloor(c.floor_from), normalizeFloor(c.floor_to)])
      if (f) floors.push(f);
  }
  return sortFloors(floors);
}

/** A lift G → L2 belongs to both G and L2; an entrance with floor_to "UG" belongs to UG. */
export function isOnFloor(
  checkpoint: { floor_from: string | null; floor_to: string | null },
  floor: string,
): boolean {
  const f = normalizeFloor(floor);
  return (
    f !== null &&
    (normalizeFloor(checkpoint.floor_from) === f || normalizeFloor(checkpoint.floor_to) === f)
  );
}
