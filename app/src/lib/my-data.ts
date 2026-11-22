/**
 * Privacy (Hong Kong PDPO): "Download my data" and "Delete my data".
 */
import { useCollection } from '@/lib/pin-collection';
import * as localDb from '@/lib/local-db';
import { queryClient, refreshLocalData } from '@/lib/query-client';
import { saveExport } from '@/lib/save-export';
import { useSavedPlaces } from '@/lib/saved-places-store';
import { supabase } from '@/lib/supabase';

/**
 * Writes everything we hold about you on this phone (recordings, raw GPS samples, checkpoints,
 * saved places) plus your server profile into one JSON file and shares it (phones) or downloads it (web).
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
    pinCollection: Object.values(useCollection.getState().pins),
    ...(await localDb.exportLocalData()),
  };

  await saveExport('scenic-stroll-my-data.json', JSON.stringify(payload, null, 2));
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
    // Pins collected (adults; under-18s never had any on the server). D54.
    const collection = await supabase.from('collection_entries').delete().not('pin_id', 'is', null);
    if (collection.error) {
      throw new Error(`Couldn’t delete your pin collection: ${collection.error.message}`);
    }
    const profile = await supabase.from('profiles').update({ display_name: null }).eq('id', userId);
    if (profile.error) throw new Error(`Couldn’t reset your profile: ${profile.error.message}`);
  }

  await localDb.deleteAllLocalData();
  useSavedPlaces.setState({ places: [] });
  useCollection.getState().clear();
  await refreshLocalData();
  await queryClient.invalidateQueries();
}
