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
 * Decodes a Google "encoded polyline" (precision 5) into points.
 * Google Routes returns routes in this format.
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): LatLng[] {
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
    // Round to avoid floating-point noise like 40.70000000000001.
    points.push({ lat: Math.round(lat) / 1e5, lng: Math.round(lng) / 1e5 });
  }
  return points;
}
