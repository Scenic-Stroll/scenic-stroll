// Driving routes for plan-trip (multimodal step 1).
//   * Google Routes API with LIVE traffic (needs the GOOGLE_ROUTES_API_KEY secret, billed per call):
//     TRAFFIC_AWARE + alternatives + traffic on the line. TRAFFIC_AWARE, not TRAFFIC_AWARE_OPTIMAL:
//     Google documents alternatives with TRAFFIC_AWARE, and it answers faster (D31).
//   * OpenRouteService driving-car as the fallback: typical times only, labelled "typical traffic".
// Docs: https://developers.google.com/maps/documentation/routes/traffic_on_polylines
import { decodePolyline } from './scenic/geo.ts';
import type { LatLng } from './scenic/schemas.ts';
import type { DriveRoute } from './scenic/trip-plan.ts';
import type { TrafficSegment } from './scenic/trip-schema.ts';

const seconds = (d: unknown) => Number.parseFloat(String(d ?? '0').replace('s', '')) || 0;
const latLng = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

const LEVELS: Record<string, TrafficSegment['level']> = {
  NORMAL: 'free',
  SLOW: 'slow',
  TRAFFIC_JAM: 'jam',
};

export async function googleDrive(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  departAt: Date,
  signal: AbortSignal,
): Promise<DriveRoute[]> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Only the fields we use (Google bills by field-mask tier).
      'X-Goog-FieldMask': [
        'routes.distanceMeters',
        'routes.duration',
        'routes.staticDuration',
        'routes.description',
        'routes.polyline.encodedPolyline',
        'routes.travelAdvisory.speedReadingIntervals',
        'routes.legs.steps.navigationInstruction.instructions',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.staticDuration',
      ].join(','),
    },
    body: JSON.stringify({
      origin: latLng(origin),
      destination: latLng(destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: true,
      extraComputations: ['TRAFFIC_ON_POLYLINE'],
      // Google refuses departure times in the past, so "now" is sent as no time at all.
      ...(departAt.getTime() > Date.now() + 60_000
        ? { departureTime: departAt.toISOString() }
        : {}),
      languageCode: 'en',
      units: 'METRIC',
    }),
  });
  if (!res.ok) throw new Error(`Google Routes (drive) HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  // deno-lint-ignore no-explicit-any
  const routes: any[] = Array.isArray(json?.routes) ? json.routes : [];
  const out = routes.flatMap((r): DriveRoute[] => {
    const coordinates = decodePolyline(String(r?.polyline?.encodedPolyline ?? ''));
    if (coordinates.length < 2) return [];
    // deno-lint-ignore no-explicit-any
    const intervals: any[] = r?.travelAdvisory?.speedReadingIntervals ?? [];
    return [
      {
        distance_m: Number(r.distanceMeters) || 0,
        duration_s: seconds(r.duration),
        typical_s: r.staticDuration ? seconds(r.staticDuration) : null,
        coordinates,
        segments: intervals.map((s) => ({
          // Google leaves out a 0 start index (protobuf default).
          from: Number(s.startPolylinePointIndex ?? 0),
          to: Number(s.endPolylinePointIndex ?? coordinates.length - 1),
          level: LEVELS[String(s.speed)] ?? 'free',
        })),
        description: typeof r.description === 'string' && r.description ? r.description : null,
        // deno-lint-ignore no-explicit-any
        steps: (r.legs ?? []).flatMap((leg: any) =>
          // deno-lint-ignore no-explicit-any
          (leg?.steps ?? []).flatMap((s: any) => {
            const instruction = s?.navigationInstruction?.instructions;
            if (typeof instruction !== 'string') return [];
            return [
              {
                instruction,
                distance_m: Number(s.distanceMeters) || 0,
                duration_s: seconds(s.staticDuration),
              },
            ];
          }),
        ),
        live: true,
      },
    ];
  });
  if (out.length === 0) throw new Error('Google Routes returned no driving route');
  return out;
}

/** OpenRouteService driving-car: no live traffic, so times are "typical". */
export async function orsDrive(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  signal: AbortSignal,
): Promise<DriveRoute[]> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    signal,
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
      // Up to 2 alternatives that share at most 60 % with the main route and are ≤ 1.4× longer.
      alternative_routes: { target_count: 2, share_factor: 0.6, weight_factor: 1.4 },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouteService (drive) HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  // deno-lint-ignore no-explicit-any
  const features: any[] = Array.isArray(json?.features) ? json.features : [];
  const out = features.flatMap((f): DriveRoute[] => {
    const line: [number, number][] = f?.geometry?.coordinates ?? [];
    if (line.length < 2) return [];
    // deno-lint-ignore no-explicit-any
    const steps: any[] = (f?.properties?.segments ?? []).flatMap((s: any) => s?.steps ?? []);
    return [
      {
        distance_m: Number(f?.properties?.summary?.distance) || 0,
        duration_s: Number(f?.properties?.summary?.duration) || 0,
        typical_s: null,
        coordinates: line.map(([lng, lat]) => ({ lat, lng })),
        segments: [],
        description: null,
        steps: steps
          .filter((s) => typeof s?.instruction === 'string')
          .map((s) => ({
            instruction: s.instruction,
            distance_m: Number(s.distance) || 0,
            duration_s: Number(s.duration) || 0,
          })),
        live: false,
      },
    ];
  });
  if (out.length === 0) throw new Error('OpenRouteService returned no driving route');
  return out;
}
