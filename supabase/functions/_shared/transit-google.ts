// Public transport via Google Routes API, travelMode=TRANSIT (multimodal step 2) — MTR, buses,
// minibuses, trams and ferries anywhere in Hong Kong, with scheduled times and fares. Needs the
// GOOGLE_ROUTES_API_KEY secret; without it plan-trip uses our own MTR planner instead.
// Docs: https://developers.google.com/maps/documentation/routes/transit-route (checked 2026-10-18)
import { decodePolyline } from './scenic/geo.ts';
import type { LatLng } from './scenic/schemas.ts';
import { mtrBoarding } from './scenic/transit/mtr-lines.ts';
import type { TransitPlan, TransitPlanLeg } from './scenic/transit/transit-plan.ts';

const seconds = (d: unknown) => Number.parseFloat(String(d ?? '0').replace('s', '')) || 0;
const latLng = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** Google vehicle types → our two CO₂ groups. Anything on rails counts as rail. */
const RAIL = new Set([
  'SUBWAY',
  'METRO_RAIL',
  'HEAVY_RAIL',
  'COMMUTER_TRAIN',
  'HIGH_SPEED_TRAIN',
  'LONG_DISTANCE_TRAIN',
  'RAIL',
  'TRAM',
  'LIGHT_RAIL',
  'MONORAIL',
  'FUNICULAR',
  'CABLE_CAR',
]);

/** Turns Google's routes into our TransitPlans (exported for the unit test). */
// deno-lint-ignore no-explicit-any
export function parseGoogleTransit(json: any, departAt: Date): TransitPlan[] {
  // deno-lint-ignore no-explicit-any
  const routes: any[] = Array.isArray(json?.routes) ? json.routes : [];
  return routes.flatMap((r, ri): TransitPlan[] => {
    // deno-lint-ignore no-explicit-any
    const steps: any[] = (r.legs ?? []).flatMap((l: any) => l?.steps ?? []);
    const legs: TransitPlanLeg[] = [];
    let clock = departAt.getTime();
    for (const s of steps) {
      const geometry = decodePolyline(String(s?.polyline?.encodedPolyline ?? ''));
      const duration = seconds(s?.staticDuration);
      const distance = Number(s?.distanceMeters) || 0;
      if (s?.travelMode === 'TRANSIT' && s.transitDetails) {
        const td = s.transitDetails;
        const dep = Date.parse(td?.stopDetails?.departureTime ?? '');
        const arr = Date.parse(td?.stopDetails?.arrivalTime ?? '');
        const rideS = Number.isFinite(dep) && Number.isFinite(arr) ? (arr - dep) / 1000 : duration;
        const waitS = Number.isFinite(dep) ? Math.max(0, (dep - clock) / 1000) : 0;
        const line = td.transitLine ?? {};
        const type = String(line?.vehicle?.type ?? 'BUS');
        const name = String(line.nameShort ?? line.name ?? 'Transit');
        const stops = Number(td.stopCount) || 0;
        const to = String(td?.stopDetails?.arrivalStop?.name ?? 'your stop');
        const vehicle = String(line?.vehicle?.name?.text ?? (RAIL.has(type) ? 'train' : 'bus'));
        legs.push({
          kind: 'ride',
          vehicle: RAIL.has(type) ? 'rail' : 'bus',
          operator: line?.agencies?.[0]?.name ?? null,
          line: name,
          color: typeof line.color === 'string' ? line.color : null,
          from_name: String(td?.stopDetails?.departureStop?.name ?? ''),
          to_name: to,
          stops,
          wait_s: Math.round(waitS),
          duration_s: Math.round(rideS),
          distance_m: distance,
          geometry: geometry.length >= 2 ? geometry : [],
          instruction: `Take ${vehicle.toLowerCase()} ${name}${td.headsign ? ` towards ${td.headsign}` : ''} · ${stops} stop${stops === 1 ? '' : 's'} · get off at ${to}`,
          realtime: false, // Google gives scheduled times; plan-trip adds operators' live ETAs
          // MTR rides: matched to our station list so plan-trip can fetch the live next train.
          // (Bus rides keep Google's scheduled times; stop cards show live bus arrivals.)
          boarding: RAIL.has(type)
            ? mtrBoarding(name, String(td?.stopDetails?.departureStop?.name ?? ''), to)
            : null,
        });
        clock += (waitS + rideS) * 1000;
        continue;
      }
      // Walking: consecutive walking steps become one leg.
      const instruction = s?.navigationInstruction?.instructions;
      const step =
        typeof instruction === 'string'
          ? [{ instruction, distance_m: distance, duration_s: duration }]
          : [];
      const last = legs.at(-1);
      if (last?.kind === 'walk') {
        last.duration_s += duration;
        last.distance_m += distance;
        last.geometry = [...last.geometry, ...geometry];
        last.instructions.push(...step);
      } else {
        legs.push({
          kind: 'walk',
          duration_s: duration,
          distance_m: distance,
          geometry,
          instructions: step,
        });
      }
      clock += duration * 1000;
    }
    // Every leg needs a drawable line; skip a route if Google left one out.
    if (!legs.some((l) => l.kind === 'ride') || legs.some((l) => l.geometry.length < 2)) return [];
    const fare = r?.travelAdvisory?.transitFare;
    return [
      {
        id: `google-${ri}`,
        legs,
        fare_hkd:
          fare && (fare.currencyCode ?? 'HKD') === 'HKD'
            ? Number(fare.units ?? 0) + Number(fare.nanos ?? 0) / 1e9
            : null,
        source: 'google',
        estimated: ['transit_times'], // timetable, not real-time
      },
    ];
  });
}

export async function googleTransit(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  departAt: Date,
  signal: AbortSignal,
): Promise<TransitPlan[]> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'routes.legs.steps.travelMode',
        'routes.legs.steps.staticDuration',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.polyline.encodedPolyline',
        'routes.legs.steps.navigationInstruction.instructions',
        'routes.legs.steps.transitDetails',
        'routes.travelAdvisory.transitFare',
      ].join(','),
    },
    body: JSON.stringify({
      origin: latLng(origin),
      destination: latLng(destination),
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      departureTime: departAt.toISOString(),
      transitPreferences: { routingPreference: 'FEWER_TRANSFERS' },
      languageCode: 'en',
    }),
  });
  if (!res.ok) throw new Error(`Google Routes (transit) HTTP ${res.status}: ${await res.text()}`);
  return parseGoogleTransit(await res.json(), departAt);
}
