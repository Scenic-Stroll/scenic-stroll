/**
 * Live location sharing with friends — opt-in, foreground only.
 *
 * While sharing, the phone sends its position about every 15 s (only while the app is open).
 * The server keeps it private: only chosen, accepted friends can read it; "approximate" is snapped
 * to ~200 m before storing; shares vanish 30 min after the last update or at the chosen expiry.
 */
import { agoLabel } from '@scenic/shared';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { create } from 'zustand';

import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Place } from '@/screens/map/types';
import { useAuth } from '@/providers/auth-provider';

export type ShareSettings = {
  audience: 'all' | 'selected';
  /** Friend user ids when audience is 'selected'. */
  recipients: string[];
  /** 15, 60, or null = until I stop. */
  minutes: number | null;
  precision: 'exact' | 'approximate';
};

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  audience: 'all',
  recipients: [],
  minutes: 60,
  precision: 'approximate', // privacy-first default
};

/**
 * Approximate mode rounds on the PHONE (so the exact point never leaves it) to the same ~200 m grid
 * the server uses (0.002°); the server snaps again as a safety net.
 */
function forSharing(lat: number, lng: number, precision: ShareSettings['precision']) {
  if (precision === 'exact') return { lat, lng };
  const snap = (v: number) => Math.round(v / 0.002) * 0.002;
  return { lat: snap(lat), lng: snap(lng) };
}

/** How often the phone sends its position while sharing. */
const UPDATE_EVERY_MS = 15_000;

type SharingState = {
  status: 'off' | 'starting' | 'on';
  settings: ShareSettings;
  expiresAt: number | null;
  lastSentAt: number | null;
  error: string | null;
};

export const useSharing = create<SharingState>(() => ({
  status: 'off',
  settings: DEFAULT_SHARE_SETTINGS,
  expiresAt: null,
  lastSentAt: null,
  error: null,
}));

let watch: Location.LocationSubscription | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function readable(message: string): string {
  if (/Hong Kong/i.test(message)) return 'Location sharing works in Hong Kong only.';
  if (/row-level security/i.test(message))
    return 'One of the chosen people isn’t your friend any more.';
  if (/Choose at least one friend/i.test(message))
    return 'Choose at least one friend to share with.';
  if (/Network request failed|fetch/i.test(message))
    return 'Can’t reach the server — check your connection.';
  return 'Couldn’t share your location. Please try again.';
}

function clearLocal() {
  watch?.remove();
  watch = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

/** Starts (or changes) sharing. Returns an error message, or null on success. */
export async function startSharing(settings: ShareSettings): Promise<string | null> {
  if (!isSupabaseConfigured) return 'Supabase isn’t configured.';
  useSharing.setState({ status: 'starting', error: null, settings });

  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    useSharing.setState({
      status: 'off',
      error: 'Location permission is off. Turn it on in your phone settings.',
    });
    return useSharing.getState().error;
  }

  let here: Location.LocationObject;
  try {
    here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    useSharing.setState({
      status: 'off',
      error: 'Couldn’t get your location. Try again outdoors.',
    });
    return useSharing.getState().error;
  }

  const first = forSharing(here.coords.latitude, here.coords.longitude, settings.precision);
  const { error } = await supabase.rpc('start_location_share', {
    p_lat: first.lat,
    p_lng: first.lng,
    p_accuracy_m: here.coords.accuracy ?? null,
    p_precision: settings.precision,
    p_share_with_all: settings.audience === 'all',
    p_minutes: settings.minutes,
    p_recipients: settings.audience === 'all' ? [] : settings.recipients,
  });
  if (error) {
    console.warn('[start_location_share]', error);
    useSharing.setState({ status: 'off', error: readable(error.message) });
    return useSharing.getState().error;
  }

  clearLocal();
  const expiresAt = settings.minutes ? Date.now() + settings.minutes * 60_000 : null;
  useSharing.setState({ status: 'on', expiresAt, lastSentAt: Date.now(), error: null });
  if (expiresAt) expiryTimer = setTimeout(() => void stopSharing(), expiresAt - Date.now());

  watch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: UPDATE_EVERY_MS, distanceInterval: 0 },
    async (loc) => {
      if (useSharing.getState().status !== 'on') return;
      const point = forSharing(loc.coords.latitude, loc.coords.longitude, settings.precision);
      const { data, error: updateError } = await supabase.rpc('update_location_share', {
        p_lat: point.lat,
        p_lng: point.lng,
        p_accuracy_m: loc.coords.accuracy ?? null,
      });
      if (updateError) {
        console.warn('[update_location_share]', updateError); // offline for a moment: try next time
        return;
      }
      if (data === false) {
        // Expired or stopped on another device.
        clearLocal();
        useSharing.setState({ status: 'off', expiresAt: null });
        return;
      }
      useSharing.setState({ lastSentAt: Date.now() });
    },
  );
  return null;
}

export async function stopSharing(): Promise<void> {
  clearLocal();
  useSharing.setState({ status: 'off', expiresAt: null, lastSentAt: null });
  const { error } = await supabase.rpc('stop_location_share');
  if (error) console.warn('[stop_location_share]', error); // it will vanish within 30 min anyway
}

/**
 * On app start: sharing never continues after the app was closed (foreground only), so remove any
 * share left on the server by a previous session.
 */
export async function cleanUpLeftoverShare(): Promise<void> {
  if (useSharing.getState().status !== 'off') return;
  const { data } = await supabase.rpc('my_location_share');
  if (Array.isArray(data) && data.length > 0) await supabase.rpc('stop_location_share');
}

// ---- friends' locations --------------------------------------------------------------------

export const FriendLocationSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().nullable(),
  precision_mode: z.enum(['exact', 'approximate']),
  updated_at: z.string(),
  expires_at: z.string().nullable(),
});
export type FriendLocation = z.infer<typeof FriendLocationSchema>;

const friendLocationsKey = ['friend-locations'] as const;

/**
 * Opens ONE Realtime subscription for the whole app (called from useBackgroundSync while signed in).
 * Any change to a share I'm allowed to see refreshes the friend-locations query.
 *
 * Why not in useFriendLocations(): several screens use that hook at once, and supabase.channel()
 * returns the SAME channel for the same name — adding a listener to an already-subscribed channel
 * throws ("cannot add postgres_changes callbacks … after subscribe()"). A unique name per
 * subscription also avoids reusing a channel that is still being removed after a re-run.
 */
export function subscribeToFriendLocations(): () => void {
  const channel = supabase
    .channel(`friend-locations-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'location_shares' }, () => {
      void queryClient.invalidateQueries({ queryKey: friendLocationsKey });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Friends' live locations (kept fresh by subscribeToFriendLocations + a 30 s refresh fallback). */
export function useFriendLocations() {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';

  return useQuery({
    queryKey: friendLocationsKey,
    enabled: signedIn && isSupabaseConfigured,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('friend_locations');
      if (error) {
        console.warn('[friend_locations]', error);
        throw new Error('Couldn’t load friends’ locations.');
      }
      const parsed = z.array(FriendLocationSchema).safeParse(data);
      return parsed.success ? parsed.data : [];
    },
  });
}

/** A friend's live location as a map place (opens the place card with "Route here"). */
export function friendAsPlace(f: FriendLocation): Place {
  const how =
    f.precision_mode === 'approximate'
      ? 'approximate (~200 m)'
      : f.accuracy_m !== null
        ? `±${Math.round(f.accuracy_m)} m`
        : 'exact';
  return {
    label: f.name,
    point: { lat: f.lat, lng: f.lng },
    kind: 'friend',
    note: `Shared ${agoLabel(f.updated_at)} · ${how}`,
  };
}
