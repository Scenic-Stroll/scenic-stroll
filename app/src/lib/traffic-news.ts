/**
 * Road incidents for the map's "Incidents" layer (multimodal step 5), straight from the Transport
 * Department's public traffic news file (no key, so no Edge Function needed — see DECISIONS D35).
 * Only fetched while the layer is on, at most every 2 minutes. If it fails the layer says
 * "Traffic news unavailable"; nothing else depends on it.
 */
import { parseTrafficNews, TRAFFIC_NEWS_URL, type TrafficIncident } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

export const TRAFFIC_NEWS_REFRESH_MS = 2 * 60_000;

export function useTrafficNews(enabled: boolean) {
  return useQuery({
    queryKey: ['traffic-news'],
    enabled,
    staleTime: TRAFFIC_NEWS_REFRESH_MS,
    refetchInterval: enabled ? TRAFFIC_NEWS_REFRESH_MS : false,
    retry: 1,
    queryFn: async (): Promise<TrafficIncident[]> => {
      // Give up after 8 s (AbortController + timer: works on every React Native version).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const res = await fetch(TRAFFIC_NEWS_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`Traffic news HTTP ${res.status}`);
        // Closed incidents stay in the feed for a while; we only show the ones still going on.
        return parseTrafficNews(await res.text()).filter((i) => i.active);
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
