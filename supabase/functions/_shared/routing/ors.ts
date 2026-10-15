// OpenRouteService — free tier, `foot-walking` profile. Docs: https://openrouteservice.org/dev/#/api-docs
import { DEMO_CENTER } from '../scenic/presets.ts';
import type { LatLng } from '../scenic/schemas.ts';
import { ProviderError, type RoutingProvider } from './types.ts';

const BASE = 'https://api.openrouteservice.org';

export function createOrsProvider(apiKey: string): RoutingProvider {
  return {
    name: 'ors',

    async walk(origin, destination) {
      const res = await fetch(`${BASE}/v2/directions/foot-walking/geojson`, {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        // ORS wants [longitude, latitude] order.
        body: JSON.stringify({
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ],
        }),
      });
      if (!res.ok) {
        throw new ProviderError(`OpenRouteService error ${res.status}: ${await res.text()}`);
      }
      const json = await res.json();
      const feature = json?.features?.[0];
      const line: [number, number][] | undefined = feature?.geometry?.coordinates;
      const summary = feature?.properties?.summary;
      // Turn-by-turn steps (ORS includes them by default, in segments[].steps[]).
      // deno-lint-ignore no-explicit-any
      const rawSteps: any[] = (feature?.properties?.segments ?? []).flatMap(
        (s: any) => s?.steps ?? [],
      );
      if (!line || line.length < 2) throw new ProviderError('OpenRouteService returned no route');

      return {
        provider: 'ors',
        // ORS omits distance/duration when start and end are the same point.
        distance_m: summary?.distance ?? 0,
        duration_s: summary?.duration ?? 0,
        coordinates: line.map(([lng, lat]) => ({ lat, lng })),
        steps: rawSteps
          .filter((s) => typeof s?.instruction === 'string')
          .map((s) => ({
            instruction: s.instruction,
            distance_m: Number(s.distance) || 0,
            duration_s: Number(s.duration) || 0,
          })),
      };
    },

    async geocode(text) {
      const params = new URLSearchParams({
        api_key: apiKey,
        text,
        size: '8',
        'boundary.country': 'HK',
        // Prefer results near CityU / Kowloon Tong.
        'focus.point.lat': String(DEMO_CENTER.lat),
        'focus.point.lon': String(DEMO_CENTER.lng),
      });
      const res = await fetch(`${BASE}/geocode/search?${params}`);
      if (!res.ok) throw new ProviderError(`OpenRouteService geocode error ${res.status}`);
      const json = await res.json();
      const features: unknown[] = Array.isArray(json?.features) ? json.features : [];

      return features.flatMap((f) => {
        // deno-lint-ignore no-explicit-any
        const feat = f as any;
        const [lng, lat] = feat?.geometry?.coordinates ?? [];
        const label = feat?.properties?.label;
        if (typeof lat !== 'number' || typeof lng !== 'number' || typeof label !== 'string')
          return [];
        return [{ label, point: { lat, lng } satisfies LatLng }];
      });
    },
  };
}
