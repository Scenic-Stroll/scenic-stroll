/**
 * Collects pins from location fixes while the app is open and tracking — recording a route or
 * walking with directions (D54). No route is needed: any tracked walk past a pin collects it.
 * While walking only a quiet toast with the pin's TITLE appears ("Pin saved: …"); the text is read
 * later, in My collection.
 */
import {
  collectStep,
  EMPTY_COLLECT_STATE,
  type CollectState,
  type GpsSample,
} from '@scenic/shared';

import { showToast } from '@/components/toast';
import { useCollection } from '@/lib/pin-collection';
import { livePinsNow } from '@/lib/pins';
import { supabase } from '@/lib/supabase';
import { currentFeatureRules } from '@/lib/user-settings';

let state: CollectState = EMPTY_COLLECT_STATE;
let userId: string | null = null;

async function currentUserId(): Promise<string | null> {
  if (userId) return userId;
  const { data } = await supabase.auth.getSession();
  userId = data.session?.user.id ?? null;
  return userId;
}

/** Feed one location fix (raw: the collect rules do their own accuracy and jump checks). */
export async function feedFixForPins(fix: GpsSample): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const pins = await livePinsNow();
  if (pins.length === 0) return;
  const collection = useCollection.getState();
  const already = new Set(collection.userId === uid ? Object.keys(collection.pins) : []);
  const result = collectStep(state, fix, pins, already);
  state = result.state;
  for (const id of result.collected) {
    const pin = pins.find((p) => p.id === id);
    if (
      !pin ||
      !useCollection.getState().add(uid, { pinId: id, title: pin.title }, fix.timestamp)
    ) {
      continue;
    }
    showToast(`Pin saved: ${pin.title}`);
  }
  if (result.collected.length > 0) void syncPinCollection();
}

/** A new walk starts from scratch (an old "inside" must not combine with a new fix). */
export function resetPinCollector() {
  state = EMPTY_COLLECT_STATE;
}

let syncing: Promise<void> | null = null;

/**
 * Tells the server about new collections. Adults: a collection entry. Under-18s (safety mode): only
 * the anonymous "pin unlocked" count — their collection never leaves the device. Never throws;
 * whatever fails is retried next time (app start, back online).
 */
export function syncPinCollection(): Promise<void> {
  syncing ??= (async () => {
    const uid = await currentUserId();
    const { userId: owner, pins, markSynced } = useCollection.getState();
    if (!uid || owner !== uid) return;
    const onServer = currentFeatureRules().collectionOnServer;
    for (const pin of Object.values(pins).filter((p) => !p.synced)) {
      const { error } = onServer
        ? await supabase.from('collection_entries').insert({ pin_id: pin.pinId })
        : await supabase.rpc('record_pin_unlock', { p_pin: pin.pinId });
      if (!error || error.code === '23505')
        markSynced(pin.pinId); // 23505: already there
      else if (/fetch|network/i.test(error.message))
        break; // offline: try again later
      else markSynced(pin.pinId); // refused (e.g. the pin was paused): don't retry forever
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
