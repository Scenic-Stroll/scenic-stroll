/**
 * Data for the "Shade now" map layer: walking paths classed by estimated shade at the current half
 * hour (public.shade_layer, merged into long lines on the server).
 *
 * Only fetched while the layer is on and the map is zoomed in, for a box snapped to a ~500 m grid,
 * so panning a little reuses what we have instead of asking again.
 */
import {
  decodePolyline,
  SHADE_BUCKET_MIN,
  SHADE_FIRST_MIN,
  shadeBucket,
  type LatLng,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const SHADE_CLASSES = ['sun', 'part', 'shade', 'covered'] as const;
export type ShadeClass = (typeof SHADE_CLASSES)[number];

const ShadeLayerSchema = z.object({
  date: z.string().nullable(),
  lines: z.array(z.tuple([z.enum(SHADE_CLASSES), z.string()])),
});

export type ShadeLine = { cls: ShadeClass; points: LatLng[] };

/** Zoomed out further than this (degrees of latitude on screen), the layer isn't drawn. */
export const SHADE_MAX_SPAN = 0.02;
/** Boxes snap to this grid (~500 m) and grow by one cell, so small pans don't refetch. */
const GRID = 0.005;
/** At night or before 07:00 there's no sun: show 13:00 instead, clearly labelled. */
const REFERENCE_BUCKET = 12;

export type MapBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function snap(box: MapBox): MapBox {
  return {
    minLng: Math.floor(box.minLng / GRID) * GRID - GRID,
    minLat: Math.floor(box.minLat / GRID) * GRID - GRID,
    maxLng: Math.ceil(box.maxLng / GRID) * GRID + GRID,
    maxLat: Math.ceil(box.maxLat / GRID) * GRID + GRID,
  };
}

/** The half-hour bucket for now (re-checked every minute), or the 13:00 reference after dark. */
function currentBucket() {
  const i = shadeBucket(new Date(), { firstMin: SHADE_FIRST_MIN, bucketMin: SHADE_BUCKET_MIN });
  return i === null
    ? { bucket: REFERENCE_BUCKET, reference: true }
    : { bucket: i, reference: false };
}

/** "13:30" for a bucket. */
export function bucketLabel(bucket: number): string {
  const m = SHADE_FIRST_MIN + bucket * SHADE_BUCKET_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function useShadeLayer(enabled: boolean, box: MapBox | null) {
  const [time, setTime] = useState(currentBucket);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setTime(currentBucket()), 60_000);
    return () => clearInterval(timer);
  }, [enabled]);

  const snapped = box ? snap(box) : null;
  const query = useQuery({
    queryKey: ['shade-layer', time.bucket, snapped],
    enabled: enabled && snapped !== null && isSupabaseConfigured,
    staleTime: 30 * 60_000,
    placeholderData: (previous) => previous, // keep the old lines while the next box loads
    queryFn: async (): Promise<{ date: string | null; lines: ShadeLine[] }> => {
      const { data, error } = await supabase.rpc('shade_layer', {
        p_bucket: time.bucket,
        p_min_lng: snapped!.minLng,
        p_min_lat: snapped!.minLat,
        p_max_lng: snapped!.maxLng,
        p_max_lat: snapped!.maxLat,
      });
      if (error) throw error;
      const parsed = ShadeLayerSchema.parse(data);
      return {
        date: parsed.date,
        lines: parsed.lines.map(([cls, encoded]) => ({ cls, points: decodePolyline(encoded, 5) })),
      };
    },
  });
  return { ...query, bucket: time.bucket, reference: time.reference };
}
