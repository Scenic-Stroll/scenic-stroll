/**
 * MTR fares (adult Octopus), from MTR's open data CSV. Not bundled with the planner — 9,000 fares
 * would make the plan-trip function ten times bigger. Instead plan-trip keeps them in the
 * server-only table public.mtr_fares, filling it from this CSV the first time it needs a fare.
 * © MTR Corporation Limited, via DATA.GOV.HK.
 */
export const MTR_FARES_CSV_URL = 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv';

export type MtrFareRow = { src_id: number; dest_id: number; octopus_adult: number };

/**
 * Parses the CSV (header: SRC_STATION_NAME, SRC_STATION_ID, DEST_STATION_NAME, DEST_STATION_ID,
 * OCT_ADT_FARE, …). Same-station rows and broken lines are skipped.
 */
export function parseMtrFaresCsv(csv: string): MtrFareRow[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.replace(/"/g, '').trim());
  const col = (name: string) => header.indexOf(name);
  const [src, dest, fare] = [col('SRC_STATION_ID'), col('DEST_STATION_ID'), col('OCT_ADT_FARE')];
  if (src < 0 || dest < 0 || fare < 0) throw new Error('MTR fares CSV: unexpected header');
  return lines.slice(1).flatMap((line): MtrFareRow[] => {
    const cells = line.split(',').map((c) => c.replace(/"/g, '').trim());
    const row = {
      src_id: Number(cells[src]),
      dest_id: Number(cells[dest]),
      octopus_adult: Number(cells[fare]),
    };
    const ok =
      Number.isInteger(row.src_id) &&
      Number.isInteger(row.dest_id) &&
      row.src_id !== row.dest_id &&
      Number.isFinite(row.octopus_adult) &&
      cells.length > fare;
    return ok ? [row] : [];
  });
}
