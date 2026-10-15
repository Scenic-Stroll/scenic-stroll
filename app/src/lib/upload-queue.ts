/**
 * Uploads saved recordings when the phone is online.
 *
 * Runs on: app start, coming back to the app, network reconnecting, after Save, and "Upload now".
 * Each upload is a single database call (create_route) — all or nothing, and safe to repeat,
 * because the route id was created on the phone.
 */
import { buildRouteUpload } from '@scenic/shared';

import * as localDb from '@/lib/local-db';
import { refreshLocalData } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

let running: Promise<void> | null = null;

/** Starts an upload pass (or joins the one already running). Never throws. */
export function processUploadQueue(): Promise<void> {
  running ??= uploadAll().finally(() => {
    running = null;
  });
  return running;
}

async function uploadAll() {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return; // not signed in yet (offline at first launch) — try again later

  for (const id of await localDb.listPendingIds()) {
    const recording = await localDb.loadRecording(id);
    if (!recording) continue;

    // Problems the user must fix (e.g. too short to trim) — don't send, explain instead.
    const built = buildRouteUpload(recording);
    if (!built.ok) {
      await localDb.setLastError(id, built.error);
      continue;
    }

    try {
      const { error } = await supabase.rpc('create_route', { payload: built.upload });
      if (error) {
        await localDb.setLastError(id, readableError(error.message));
        continue;
      }
      await localDb.markUploaded(id);
    } catch (err) {
      // Network failure: stop this pass, everything stays queued for next time.
      await localDb.setLastError(id, 'No connection — will upload automatically when online.');
      console.warn('upload failed', err);
      break;
    }
  }
  await refreshLocalData();
}

function readableError(message: string): string {
  if (/Network request failed|Failed to fetch|timed? ?out/i.test(message)) {
    return 'No connection — will upload automatically when online.';
  }
  if (/Could not find the function|schema cache/i.test(message)) {
    return 'The server isn’t set up for routes yet (database migration not applied).';
  }
  if (/row-level security/i.test(message)) {
    return 'Upload limit reached (60 routes per hour). It will retry later.';
  }
  return message;
}
