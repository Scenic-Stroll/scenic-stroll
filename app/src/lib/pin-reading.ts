/**
 * Reading a collected pin (D54). The reading itself is local (works for everyone, offline after
 * the first load); for adults the server also records it and awards pin-read points — but only
 * when the reader stayed open long enough, which the server measures itself (phase 5).
 */
import type { ReadingLevel } from '@scenic/shared';

import { useCollection } from '@/lib/pin-collection';

/** Called when the reader opens. Returns a function to call when the person is done reading. */
export function startReading(pinId: string): (level: ReadingLevel) => Promise<void> {
  return async (level) => {
    useCollection.getState().markRead(pinId, level);
  };
}
