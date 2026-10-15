// Picks the routing provider from the ROUTING_PROVIDER secret ("ors" by default, or "google").
// Switching providers is a config change: `npx supabase secrets set ROUTING_PROVIDER=google`.
import { createGoogleProvider } from './google.ts';
import { createOrsProvider } from './ors.ts';
import { ProviderError, type RoutingProvider } from './types.ts';

export { ProviderError } from './types.ts';
export type { RoutingProvider } from './types.ts';

export function getRoutingProvider(env: (name: string) => string | undefined): RoutingProvider {
  const choice = (env('ROUTING_PROVIDER') ?? 'ors').toLowerCase();

  if (choice === 'google') {
    const key = env('GOOGLE_ROUTES_API_KEY');
    if (!key) throw new ProviderError('GOOGLE_ROUTES_API_KEY is not set');
    return createGoogleProvider(key);
  }
  if (choice === 'ors') {
    const key = env('ORS_API_KEY');
    if (!key) throw new ProviderError('ORS_API_KEY is not set');
    return createOrsProvider(key);
  }
  throw new ProviderError(`Unknown ROUTING_PROVIDER "${choice}" (use "ors" or "google")`);
}

/** For health checks: which provider is selected and which of its secrets are missing (names only). */
export function routingHealth(env: (name: string) => string | undefined): {
  provider: string;
  missingSecrets: string[];
} {
  const provider = (env('ROUTING_PROVIDER') ?? 'ors').toLowerCase();
  const needed = provider === 'google' ? ['GOOGLE_ROUTES_API_KEY'] : ['ORS_API_KEY'];
  return { provider, missingSecrets: needed.filter((name) => !env(name)) };
}
