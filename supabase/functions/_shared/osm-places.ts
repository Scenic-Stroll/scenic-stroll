// The OpenStreetMap place nearest to a point, through openrouteservice's reverse geocoder (Pelias,
// built on OSM). Used by pin-tools to snap a new pin to an OSM place within 25 m (D53). We don't
// keep a copy of OSM: one request per snap is enough for a handful of experts.
const TIMEOUT_MS = 8000;

export type OsmPlace = {
  osm_id: string;
  name: string;
  lat: number;
  lng: number;
  distance_m: number;
};

// deno-lint-ignore no-explicit-any
type Json = any;

/** Pelias features → the nearest OSM place within maxM metres (Pelias gives km). */
export function nearestOsmFeature(json: Json, maxM: number): OsmPlace | null {
  const features: Json[] = Array.isArray(json?.features) ? json.features : [];
  const places = features.flatMap((f): OsmPlace[] => {
    const p = f?.properties ?? {};
    const idFromGid = typeof p.gid === 'string' ? p.gid.split(':').at(-1) : undefined;
    const osmId = [p.id, idFromGid].find(
      (v): v is string => typeof v === 'string' && /^(node|way|relation)\/\d+$/.test(v),
    );
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    const distanceM = typeof p.distance === 'number' ? p.distance * 1000 : NaN;
    if (
      p.source !== 'openstreetmap' ||
      !osmId ||
      typeof lat !== 'number' ||
      typeof lng !== 'number'
    )
      return [];
    if (!(distanceM <= maxM)) return [];
    const name = String(p.name ?? p.label ?? osmId).slice(0, 120);
    return [{ osm_id: osmId, name, lat, lng, distance_m: Math.round(distanceM) }];
  });
  places.sort((a, b) => a.distance_m - b.distance_m);
  return places[0] ?? null;
}

export async function nearestOsmPlace(
  point: { lat: number; lng: number },
  apiKey: string,
  maxM: number,
  fetchFn: typeof fetch = fetch,
): Promise<OsmPlace | null> {
  const params = new URLSearchParams({
    'point.lat': String(point.lat),
    'point.lon': String(point.lng),
    'boundary.circle.radius': String(maxM / 1000),
    sources: 'osm',
    size: '10',
  });
  try {
    const res = await fetchFn(`https://api.openrouteservice.org/geocode/reverse?${params}`, {
      // The key in a header, never in the address (addresses end up in logs — D48).
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? nearestOsmFeature(await res.json(), maxM) : null;
  } catch {
    return null; // snapping to OSM is a convenience; the expert can still pick "custom place"
  }
}
