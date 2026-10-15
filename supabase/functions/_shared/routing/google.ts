// Google Routes API (walking) + Places Text Search for geocoding.
// Docs: https://developers.google.com/maps/documentation/routes/compute_route_directions
import { decodePolyline } from '../scenic/geo.ts';
import { DEMO_CENTER } from '../scenic/presets.ts';
import { ProviderError, type RoutingProvider } from './types.ts';

export function createGoogleProvider(apiKey: string): RoutingProvider {
  return {
    name: 'google',

    async walk(origin, destination) {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Only ask for the fields we use (Google bills by field mask tier).
          'X-Goog-FieldMask': [
            'routes.distanceMeters',
            'routes.duration',
            'routes.polyline.encodedPolyline',
            'routes.legs.steps.navigationInstruction.instructions',
            'routes.legs.steps.distanceMeters',
            'routes.legs.steps.staticDuration',
          ].join(','),
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: {
            location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
          },
          travelMode: 'WALK',
        }),
      });
      if (!res.ok)
        throw new ProviderError(`Google Routes error ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const route = json?.routes?.[0];
      const encoded: string | undefined = route?.polyline?.encodedPolyline;
      if (!encoded) throw new ProviderError('Google Routes returned no route');

      const coordinates = decodePolyline(encoded);
      if (coordinates.length < 2) throw new ProviderError('Google Routes returned an empty line');

      return {
        provider: 'google',
        distance_m: route.distanceMeters ?? 0,
        // Duration is a string like "754s".
        duration_s: Number.parseFloat(String(route.duration ?? '0').replace('s', '')) || 0,
        coordinates,
        // deno-lint-ignore no-explicit-any
        steps: (route.legs ?? [])
          .flatMap((leg: any) => leg?.steps ?? [])
          .flatMap((s: any) => {
            const instruction = s?.navigationInstruction?.instructions;
            if (typeof instruction !== 'string') return [];
            return [
              {
                instruction,
                distance_m: Number(s.distanceMeters) || 0,
                duration_s:
                  Number.parseFloat(String(s.staticDuration ?? '0').replace('s', '')) || 0,
              },
            ];
          }),
      };
    },

    async geocode(text) {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({
          textQuery: text,
          regionCode: 'HK',
          maxResultCount: 8,
          locationBias: {
            circle: {
              center: { latitude: DEMO_CENTER.lat, longitude: DEMO_CENTER.lng },
              radius: 5000,
            },
          },
        }),
      });
      if (!res.ok) throw new ProviderError(`Google Places error ${res.status}`);
      const json = await res.json();
      const places: unknown[] = Array.isArray(json?.places) ? json.places : [];

      return places.flatMap((p) => {
        // deno-lint-ignore no-explicit-any
        const place = p as any;
        const lat = place?.location?.latitude;
        const lng = place?.location?.longitude;
        const name = place?.displayName?.text ?? place?.formattedAddress;
        if (typeof lat !== 'number' || typeof lng !== 'number' || typeof name !== 'string')
          return [];
        return [{ label: name, point: { lat, lng } }];
      });
    },
  };
}
