/**
 * Privacy (Hong Kong PDPO): "Download my data" and "Delete my data".
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import * as localDb from '@/lib/local-db';
import { queryClient, refreshLocalData } from '@/lib/query-client';
import { useSavedPlaces } from '@/lib/saved-places-store';
import { supabase } from '@/lib/supabase';

/**
 * Writes everything we hold about you on this phone (recordings, raw GPS samples, checkpoints,
 * saved places) plus your server profile into one JSON file and opens the share sheet.
 */
export async function downloadMyData(userId: string | null): Promise<void> {
  let profile: unknown = null;
  if (userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    profile = data;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    note:
      'Scenic Stroll data export. "samples" are raw GPS points that never left your phone; ' +
      'only simplified lines of uploaded routes are on the server.',
    userId,
    profile,
    savedPlaces: useSavedPlaces.getState().places,
    ...(await localDb.exportLocalData()),
  };

  const file = new File(Paths.cache, 'scenic-stroll-my-data.json');
  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing isn’t available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Your Scenic Stroll data',
    UTI: 'public.json',
  });
}

/**
 * Deletes your routes and descriptions on the server (RLS only lets you delete your own rows),
 * clears your display name, then wipes everything on this phone.
 * Throws (and deletes nothing locally) if the server part fails, so you can retry.
 */
export async function deleteMyData(userId: string | null): Promise<void> {
  if (userId) {
    // `.not('id', 'is', null)` is a filter that matches every row; RLS narrows it to YOUR rows.
    // (Supabase refuses DELETE without a filter, as a safety net.)
    const routes = await supabase.from('routes').delete().not('id', 'is', null);
    if (routes.error) throw new Error(`Couldn’t delete your routes: ${routes.error.message}`);
    const descriptions = await supabase.from('route_descriptions').delete().not('id', 'is', null);
    if (descriptions.error) {
      throw new Error(`Couldn’t delete your descriptions: ${descriptions.error.message}`);
    }
    const profile = await supabase.from('profiles').update({ display_name: null }).eq('id', userId);
    if (profile.error) throw new Error(`Couldn’t reset your profile: ${profile.error.message}`);
  }

  await localDb.deleteAllLocalData();
  useSavedPlaces.setState({ places: [] });
  await refreshLocalData();
  await queryClient.invalidateQueries();
}
