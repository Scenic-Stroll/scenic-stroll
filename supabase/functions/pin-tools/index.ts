// POST /functions/v1/pin-tools — helpers for the expert pin form (/admin), experts and admins only.
//   { action: 'snap', point }            → the pedestrian node and OSM place within 25 m, if any
//   { action: 'lookup_source', query }   → a source from a DOI or title (OpenAlex, then Crossref)
// D53, docs/PINS.md.
import { guarded, LIMITS } from '../_shared/guard.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { nearestOsmPlace } from '../_shared/osm-places.ts';
import {
  LookupSourceResponseSchema,
  PinToolsRequestSchema,
  SNAP_RADIUS_M,
  SnapResponseSchema,
} from '../_shared/scenic/pin-api.ts';
import { lookupSource } from '../_shared/sources.ts';

export default {
  fetch: guarded('pin-tools', LIMITS.pinTools, async (req, ctx) => {
    if (req.method === 'GET') return json({ ok: true, function: 'pin-tools' });
    if (req.method !== 'POST') return errorResponse('Use POST', 405);

    const { data: role } = await ctx.supabase.rpc('my_pin_role');
    if (role !== 'admin' && role !== 'expert') {
      return errorResponse('Only experts and reviewers can use this', 403);
    }
    const body = await readBody(req, PinToolsRequestSchema);
    if ('response' in body) return body.response;
    const request = body.data;

    if (request.action === 'lookup_source') {
      const source = await lookupSource(request.query);
      return json(LookupSourceResponseSchema.parse({ source }));
    }

    const { point } = request;
    const orsKey = Deno.env.get('ORS_API_KEY');
    const [node, osm] = await Promise.all([
      ctx.supabase.rpc('nearest_ped_node', {
        p_lat: point.lat,
        p_lng: point.lng,
        p_max_m: SNAP_RADIUS_M,
      }),
      orsKey ? nearestOsmPlace(point, orsKey, SNAP_RADIUS_M) : Promise.resolve(null),
    ]);
    if (node.error) console.error('nearest_ped_node failed:', node.error.message);
    const row = node.data?.[0];
    return json(
      SnapResponseSchema.parse({
        ped_node: row
          ? {
              build_id: Number(row.build_id),
              node_id: row.node_id,
              kind: row.kind,
              level: row.level,
              lat: row.lat,
              lng: row.lng,
              distance_m: Math.round(row.distance_m),
            }
          : null,
        osm,
      }),
    );
  }),
};
