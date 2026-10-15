/**
 * Calls to our Supabase Edge Functions. Every response is validated with the shared zod schemas,
 * and every failure becomes a FunctionCallError with a message a user can act on.
 * Technical details go to the console (visible in the `npx expo start` terminal).
 */
import {
  ConditionsSchema,
  FUNCTIONS,
  FunctionHealthSchema,
  GeocodeResponseSchema,
  PlanRouteResponseSchema,
  type Conditions,
  type FunctionHealth,
  type FunctionName,
  type GeocodeResult,
  type LatLng,
  type PlanRouteResponse,
} from '@scenic/shared';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type { z } from 'zod';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type FunctionErrorKind =
  | 'not_configured' // app/.env missing
  | 'not_deployed' // 404: the function isn't on the Supabase project
  | 'offline' // couldn't reach Supabase at all
  | 'unauthorized' // 401: not signed in / bad token
  | 'provider' // routing/LLM provider failed or a server secret is missing
  | 'bad_request' // 400: we sent something invalid
  | 'unknown';

export class FunctionCallError extends Error {
  constructor(
    readonly kind: FunctionErrorKind,
    message: string,
    readonly functionName: FunctionName,
  ) {
    super(message);
  }
}

/** Turns any Supabase/network failure into a FunctionCallError with a friendly message. */
async function toFunctionError(name: FunctionName, error: unknown): Promise<FunctionCallError> {
  if (error instanceof FunctionsHttpError) {
    const status: number = error.context.status;
    const body = await error.context.json().catch(() => null);
    console.warn(`[${name}] HTTP ${status}`, body);
    const serverMessage: string | undefined =
      typeof body?.error === 'string'
        ? body.error
        : typeof body?.message === 'string'
          ? body.message.replace('[@supabase/server] ', '')
          : undefined;

    if (status === 404) {
      return new FunctionCallError(
        'not_deployed',
        `The “${name}” service isn’t deployed on the server yet. Run “npm run deploy:functions” (see docs/SETUP.md).`,
        name,
      );
    }
    if (status === 401 || status === 403) {
      return new FunctionCallError(
        'unauthorized',
        'You’re not signed in, so the server refused the request. Check Profile → Diagnostics (anonymous sign-ins may be turned off).',
        name,
      );
    }
    if (status === 400) {
      return new FunctionCallError(
        'bad_request',
        serverMessage ?? 'The request was invalid.',
        name,
      );
    }
    if (status === 429) {
      return new FunctionCallError(
        'provider',
        'Too many requests — wait a minute and try again.',
        name,
      );
    }
    if (status === 502) {
      return new FunctionCallError(
        'provider',
        /_API_KEY is not set/.test(serverMessage ?? '')
          ? `The server is missing a key: ${serverMessage}. See docs/SETUP.md step 7.`
          : `The routing service had a problem: ${serverMessage ?? 'unknown error'}`,
        name,
      );
    }
    return new FunctionCallError('unknown', serverMessage ?? `Server error (${status}).`, name);
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    console.warn(`[${name}] network`, error);
    return new FunctionCallError(
      'offline',
      'Can’t reach the server — check your internet connection.',
      name,
    );
  }
  console.warn(`[${name}] unexpected`, error);
  return new FunctionCallError(
    'unknown',
    error instanceof Error ? error.message : String(error),
    name,
  );
}

/** Calls an Edge Function and validates its JSON response. */
async function callFunction<T extends z.ZodType>(
  name: FunctionName,
  options: { method: 'GET' } | { method: 'POST'; body: Record<string, unknown> },
  schema: T,
): Promise<z.infer<T>> {
  if (!isSupabaseConfigured) {
    throw new FunctionCallError(
      'not_configured',
      'Supabase isn’t configured — see docs/SETUP.md.',
      name,
    );
  }
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) throw await toFunctionError(name, error);

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[${name}] unexpected response`, data, parsed.error.issues);
    throw new FunctionCallError(
      'unknown',
      `The server sent an unexpected answer (“${name}” may be an old version — redeploy it).`,
      name,
    );
  }
  return parsed.data;
}

export function planRoute(origin: LatLng, destination: LatLng): Promise<PlanRouteResponse> {
  return callFunction(
    FUNCTIONS.planRoute,
    { method: 'POST', body: { origin, destination } },
    PlanRouteResponseSchema,
  );
}

export async function geocode(text: string): Promise<GeocodeResult[]> {
  const res = await callFunction(
    FUNCTIONS.geocode,
    { method: 'POST', body: { text } },
    GeocodeResponseSchema,
  );
  return res.results;
}

/** Live weather + sun around CityU (Hong Kong Observatory, cached on the server). */
export function fetchConditions(): Promise<Conditions> {
  return callFunction(FUNCTIONS.conditions, { method: 'POST', body: {} }, ConditionsSchema);
}

/** Profile → Diagnostics → "Test backend": asks one function for its health report. */
export function pingFunction(name: FunctionName): Promise<FunctionHealth> {
  return callFunction(name, { method: 'GET' }, FunctionHealthSchema);
}
