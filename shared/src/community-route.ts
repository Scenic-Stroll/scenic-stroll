/**
 * A community route as the app reads it from the `routes_public` view.
 * The view returns the line as GeoJSON ([lng, lat] pairs); we convert to {lat, lng}.
 */
import { z } from 'zod';

import { RouteStatusSchema, type LatLng } from './schemas.ts';

/** Columns the app selects from routes_public (keep in sync with the view in supabase/migrations). */
export const COMMUNITY_ROUTE_COLUMNS =
  'id,title,start_label,end_label,distance_m,duration_s,status,last_confirmed_at,created_at,geojson,author_name';

const GeoJsonLineSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const CommunityRouteRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_label: z.string().nullable(),
  end_label: z.string().nullable(),
  distance_m: z.number(),
  duration_s: z.number(),
  status: RouteStatusSchema,
  last_confirmed_at: z.string().nullable(),
  created_at: z.string(),
  geojson: GeoJsonLineSchema,
  author_name: z.string().nullable(),
});

export type CommunityRoute = {
  id: string;
  title: string;
  startLabel: string | null;
  endLabel: string | null;
  distanceM: number;
  durationS: number;
  status: z.infer<typeof RouteStatusSchema>;
  lastConfirmedAt: string | null;
  createdAt: string;
  authorName: string | null;
  line: LatLng[];
  /** Taxonomy tags; filled by AI tagging (Phase 3) — empty until then. */
  tags: string[];
};

/** Parses rows from routes_public, skipping (and reporting) any malformed row instead of failing all. */
export function parseCommunityRoutes(rows: unknown): { routes: CommunityRoute[]; skipped: number } {
  const list = Array.isArray(rows) ? rows : [];
  const routes: CommunityRoute[] = [];
  let skipped = 0;
  for (const row of list) {
    const parsed = CommunityRouteRowSchema.safeParse(row);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const r = parsed.data;
    routes.push({
      id: r.id,
      title: r.title,
      startLabel: r.start_label,
      endLabel: r.end_label,
      distanceM: r.distance_m,
      durationS: r.duration_s,
      status: r.status,
      lastConfirmedAt: r.last_confirmed_at,
      createdAt: r.created_at,
      authorName: r.author_name,
      line: r.geojson.coordinates.map(([lng, lat]) => ({ lat, lng })),
      tags: [],
    });
  }
  return { routes, skipped };
}
