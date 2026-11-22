/**
 * Live knowledge pins for the map, and one pin's approved content for the reader (D54).
 * The database only returns live pins and their approved versions/questions to app users (D51).
 */
import {
  MapPinSchema,
  type MapPin,
  type PinLabel,
  type PinQuestion,
  type PinSource,
  type ReadingLevel,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const LIVE_PINS_KEY = ['live-pins'] as const;

async function fetchLivePins(): Promise<MapPin[]> {
  const { data, error } = await supabase
    .from('pins_map')
    .select(
      'id, title, label, radius_m, topics, status, is_sample, place_kind, place_description, lat, lng',
    )
    .eq('status', 'live');
  if (error) throw new Error('Couldn’t load pins.');
  return z.array(MapPinSchema).parse(data);
}

export function useLivePins() {
  return useQuery({
    queryKey: LIVE_PINS_KEY,
    enabled: isSupabaseConfigured,
    queryFn: fetchLivePins,
    staleTime: 10 * 60_000,
  });
}

/** For code outside React (the collector): the cached live pins, loading them if needed. */
export async function livePinsNow(): Promise<MapPin[]> {
  try {
    return await queryClient.ensureQueryData({ queryKey: LIVE_PINS_KEY, queryFn: fetchLivePins });
  } catch {
    return queryClient.getQueryData<MapPin[]>(LIVE_PINS_KEY) ?? [];
  }
}

export type PinContent = {
  id: string;
  title: string;
  label: PinLabel;
  is_sample: boolean;
  beyond_hk_text: string | null;
  beyond_hk_source: PinSource | null;
  sources: PinSource[];
  versions: {
    reading_level: ReadingLevel;
    body: string;
    questions: PinQuestion[];
  }[];
};

/** A live pin with its approved versions, approved questions and sources. */
export function usePinContent(pinId: string | undefined) {
  return useQuery({
    queryKey: ['pin-content', pinId],
    enabled: !!pinId && isSupabaseConfigured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PinContent | null> => {
      const [pin, sources, versions] = await Promise.all([
        supabase
          .from('pins')
          .select('id, title, label, is_sample, beyond_hk_text, beyond_hk_source_id')
          .eq('id', pinId!)
          .maybeSingle(),
        supabase
          .from('pin_sources')
          .select('id, title, url, doi, source_db, is_open_access')
          .eq('pin_id', pinId!),
        supabase
          .from('pin_versions')
          .select('reading_level, body, pin_questions(prompt, options, answer, explanation)')
          .eq('pin_id', pinId!),
      ]);
      if (pin.error || sources.error || versions.error) throw new Error('Couldn’t load the pin.');
      const row = pin.data;
      if (!row) return null;
      const all = (sources.data ?? []) as (PinSource & { id: string })[];
      const beyond = all.find((s) => s.id === row.beyond_hk_source_id) ?? null;
      return {
        id: row.id as string,
        title: row.title as string,
        label: row.label as PinLabel,
        is_sample: row.is_sample as boolean,
        beyond_hk_text: row.beyond_hk_text as string | null,
        beyond_hk_source: beyond,
        sources: all.filter((s) => s.id !== beyond?.id),
        versions: (versions.data ?? []).map((v) => ({
          reading_level: v.reading_level as ReadingLevel,
          body: v.body as string,
          questions: (v.pin_questions ?? []) as PinQuestion[],
        })),
      };
    },
  });
}
