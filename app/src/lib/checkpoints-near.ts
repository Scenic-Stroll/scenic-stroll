/**
 * Community checkpoints near a building (for the map's floor selector).
 * Public data: works signed-out too.
 */
import type { LatLng } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const NearCheckpointSchema = z.object({
  id: z.number(),
  route_id: z.string(),
  kind: z.enum(['lift', 'escalator', 'stairs', 'entrance', 'footbridge', 'underpass', 'note']),
  floor_from: z.string().nullable(),
  floor_to: z.string().nullable(),
  note: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type NearCheckpoint = z.infer<typeof NearCheckpointSchema>;

/** Checkpoints within `radiusM` of `center`. Pass null to load nothing. */
export function useCheckpointsNear(key: string | null, center: LatLng | null, radiusM = 150) {
  return useQuery({
    queryKey: ['checkpoints-near', key, radiusM],
    enabled: isSupabaseConfigured && key !== null && center !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('checkpoints_near', {
        p_lat: center!.lat,
        p_lng: center!.lng,
        p_radius_m: radiusM,
      });
      if (error) {
        console.warn('[checkpoints_near]', error);
        throw new Error('Couldn’t load floor info.');
      }
      const parsed = z.array(NearCheckpointSchema).safeParse(data);
      return parsed.success ? parsed.data : [];
    },
  });
}
