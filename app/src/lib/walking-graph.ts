/**
 * Which walking graph is live on the server (for Profile → Diagnostics: "Map data updated …").
 * The graph is open data, so this works signed-out too.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const ActiveGraphSchema = z.object({
  source: z.string(),
  source_version: z.string(),
  edge_count: z.number(),
  activated_at: z.string().nullable(),
});
export type ActiveGraph = z.infer<typeof ActiveGraphSchema>;

export function useActiveGraph() {
  return useQuery({
    queryKey: ['active-graph'],
    enabled: isSupabaseConfigured,
    staleTime: 60 * 60_000, // rebuilt rarely
    queryFn: async (): Promise<ActiveGraph | null> => {
      const { data, error } = await supabase
        .from('graph_builds')
        .select('source, source_version, edge_count, activated_at')
        .eq('status', 'active')
        .maybeSingle();
      if (error) {
        console.warn('[graph_builds]', error);
        throw new Error('Couldn’t check the walking map.');
      }
      const parsed = ActiveGraphSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
  });
}
