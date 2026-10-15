/**
 * Demo-area landmarks for the origin/destination picker and for snapping start/end labels.
 *
 * Coordinates come from OpenStreetMap (© OpenStreetMap contributors, ODbL), downloaded 2026-10-07:
 * MTR exits are the mapped `railway=subway_entrance` nodes; buildings are the centre of the mapped outline.
 * Festival Walk entrances and CityU gates are NOT named in OSM — add them after the Oct 10 walk
 * (stand at the spot, read the GPS from the Record screen, add a row here).
 */
import { haversineMeters } from './geo.ts';
import type { LatLng } from './schemas.ts';

/** Map centre for the demo: between CityU (YEUNG) and Festival Walk. Verified against OSM. */
export const DEMO_CENTER: LatLng = { lat: 22.3365, lng: 114.1735 };

export type PresetKind = 'mtr_exit' | 'mall' | 'cityu';

export type Preset = {
  id: string;
  kind: PresetKind;
  en: string;
  zh: string;
  point: LatLng;
};

export const PRESET_KIND_LABELS: Record<PresetKind, { en: string; zh: string }> = {
  mtr_exit: { en: 'Kowloon Tong MTR', zh: '九龍塘港鐵站' },
  mall: { en: 'Festival Walk', zh: '又一城' },
  cityu: { en: 'CityU', zh: '城大' },
};

const mtr = (exit: string, lat: number, lng: number): Preset => ({
  id: `kot-exit-${exit.toLowerCase()}`,
  kind: 'mtr_exit',
  en: `Kowloon Tong Exit ${exit}`,
  zh: `九龍塘站 ${exit} 出口`,
  point: { lat, lng },
});

export const PRESETS: readonly Preset[] = [
  // Kowloon Tong MTR exits (OSM railway=subway_entrance)
  mtr('A1', 22.336895, 114.177764),
  mtr('A2', 22.336889, 114.177984),
  mtr('B', 22.336968, 114.176553),
  mtr('C1', 22.336961, 114.175531),
  mtr('C2', 22.33668, 114.175493),
  mtr('D', 22.336482, 114.176524),
  mtr('E', 22.336664, 114.177556),
  mtr('F', 22.337088, 114.176255),
  mtr('G1', 22.33703, 114.17598),
  mtr('G2', 22.337129, 114.175927),
  mtr('H', 22.337023, 114.175645),

  // Festival Walk (centre of the mall outline)
  {
    id: 'festival-walk',
    kind: 'mall',
    en: 'Festival Walk',
    zh: '又一城',
    point: { lat: 22.337331, lng: 114.174601 },
  },

  // CityU buildings (centre of each outline)
  {
    id: 'cityu-yeung',
    kind: 'cityu',
    en: 'Yeung Kin Man Academic Building (YEUNG)',
    zh: '楊建文學術樓',
    point: { lat: 22.335892, lng: 114.173197 },
  },
  {
    id: 'cityu-ac2',
    kind: 'cityu',
    en: 'Li Dak Sum Yip Yio Chin Academic Building (AC2)',
    zh: '李達三葉耀珍學術樓',
    point: { lat: 22.337649, lng: 114.171534 },
  },
  {
    id: 'cityu-ac3',
    kind: 'cityu',
    en: 'Lau Ming Wai Academic Building (AC3)',
    zh: '劉鳴煒學術樓',
    point: { lat: 22.338116, lng: 114.172391 },
  },
  {
    id: 'cityu-mmw',
    kind: 'cityu',
    en: 'Mong Man-wai Building (MMW)',
    zh: '蒙民偉樓',
    point: { lat: 22.336116, lng: 114.174147 },
  },
  {
    id: 'cityu-cmc',
    kind: 'cityu',
    en: 'Run Run Shaw Creative Media Centre (CMC)',
    zh: '邵逸夫創意媒體中心',
    point: { lat: 22.340125, lng: 114.168472 },
  },
  {
    id: 'cityu-international-centre',
    kind: 'cityu',
    en: 'CityU International Centre',
    zh: '城大國際中心大樓',
    point: { lat: 22.339791, lng: 114.171463 },
  },
  {
    id: 'cityu-student-residence',
    kind: 'cityu',
    en: 'Student Residence',
    zh: '城市大學學生宿舍',
    point: { lat: 22.339986, lng: 114.17045 },
  },
];

/**
 * The closest preset within `maxMeters`, or null. Used to auto-label a recorded route's start/end
 * ("snap to nearest preset if within 60 m").
 */
export function nearestPreset(
  point: LatLng,
  maxMeters: number,
  presets: readonly Preset[] = PRESETS,
): Preset | null {
  let best: Preset | null = null;
  let bestDistance = Infinity;
  for (const preset of presets) {
    const d = haversineMeters(point, preset.point);
    if (d <= maxMeters && d < bestDistance) {
      best = preset;
      bestDistance = d;
    }
  }
  return best;
}
