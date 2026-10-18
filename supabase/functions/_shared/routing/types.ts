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

/**
 * Give up on a routing provider after this long. Without it, a provider that stops answering
 * (OpenRouteService directions did on 2026-10-18) made our functions hang ~2 minutes; now the app
 * gets "unavailable" quickly and shows what it has.
 */
export const PROVIDER_TIMEOUT_MS = 8_000;
