/**
 * Small geometry helpers that run on the phone, in Edge Functions and in tests.
 * Heavy spatial work (matching, buffers, "routes near me") is done in PostGIS instead.
 */
import type { LatLng } from './schemas.ts';

const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. Accurate to well under 1 m at walking scale. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a path, in metres. */
export function pathLengthMeters(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Decodes a Google "encoded polyline" into points. Google Routes uses precision 5 (~1 m);
 * our walking graph export uses precision 6 (~10 cm, PostGIS ST_AsEncodedPolyline(geom, 6)).
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  // Reads one signed number from the string (variable-length, 5 bits per character).
  const readValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += readValue();
    lng += readValue();
    // lat/lng are whole numbers here, so one division gives the nearest decimal (no 40.70000000000001).
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/**
 * Reads a point from PostGIS's hex EWKB, the way Realtime sends geometry columns, e.g.
 * "0101000020E6100000<lng: 8 bytes><lat: 8 bytes>". Returns null for anything that isn't a point.
 */
export function pointFromEwkbHex(hex: string): LatLng | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42) return null;
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = view.getUint32(1, little);
  if ((type & 0xff) !== 1) return null; // 1 = Point
  const offset = type & 0x20000000 ? 9 : 5; // the SRID flag adds 4 bytes
  if (bytes.length < offset + 16) return null;
  return { lng: view.getFloat64(offset, little), lat: view.getFloat64(offset + 8, little) };
}

/**
 * A point from a PostGIS geometry the way Supabase hands it over: GeoJSON
 * ({ type: 'Point', coordinates: [lng, lat] } — what Realtime sends) or hex EWKB. null otherwise.
 */
export function pointFromPostgis(value: unknown): LatLng | null {
  if (typeof value === 'string') return pointFromEwkbHex(value);
  if (!value || typeof value !== 'object') return null;
  const g = value as { type?: unknown; coordinates?: unknown };
  const c = g.coordinates;
  if (g.type !== 'Point' || !Array.isArray(c)) return null;
  const [lng, lat] = c;
  return typeof lng === 'number' && typeof lat === 'number' ? { lng, lat } : null;
}
