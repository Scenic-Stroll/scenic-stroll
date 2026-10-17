/**
 * Find a transit stop by id, with its name and position (for the app's map and stop card). Our
 * generated list covers bus/minibus stops near CityU; MTR Next Train covers every station, so any
 * MTR station works too.
 */
import { DEMO_STOPS } from './demo-stops.ts';
import type { TransitStop } from './eta-schema.ts';
import { MTR_STATIONS } from './mtr-data.ts';
import { mtrLinesAt } from './mtr-lines.ts';

export function findStop(id: string): TransitStop | null {
  const known = DEMO_STOPS.find((s) => s.id === id);
  if (known) return known;
  const [operator, code] = id.split(':');
  if (operator !== 'mtr') return null;
  const station = MTR_STATIONS.find((s) => s.code === code);
  if (!station) return null;
  return {
    id,
    operator: 'mtr',
    code: station.code,
    name_en: station.en,
    name_zh: station.zh,
    lat: station.lat,
    lng: station.lng,
    routes: mtrLinesAt(station.code),
  };
}
