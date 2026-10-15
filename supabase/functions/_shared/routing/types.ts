// The routing provider interface. Add a provider by implementing this and registering it in index.ts.
import type { GeocodeResult, PlanRouteResponse } from '../scenic/api.ts';
import type { LatLng } from '../scenic/schemas.ts';

export interface RoutingProvider {
  readonly name: PlanRouteResponse['provider'];
  /** A standard walking route between two points. */
  walk(origin: LatLng, destination: LatLng): Promise<PlanRouteResponse>;
  /** Free-text place search, biased to the demo area. */
  geocode(text: string): Promise<GeocodeResult[]>;
}

/** Thrown for problems the user can't fix (bad key, provider down). Message is safe to show. */
export class ProviderError extends Error {}
