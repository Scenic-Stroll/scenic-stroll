/**
 * Reading a collected pin (D54, D55). The read is always kept on the device (everyone, offline
 * too). For adults the server also records it and awards pin-read points — only if the reader
 * stayed open ≥ 10 s, timed by the server itself (start_pin_read → award-points).
 */
import type { ReadingLevel } from '@scenic/shared';

import { useCollection } from '@/lib/pin-collection';
import { syncPinCollection } from '@/lib/pin-collector';
import { finishPinRead, startPinReadTimer } from '@/lib/points';

/** Called when the reader opens. Returns the function to call when the person is done reading. */
export function startReading(pinId: string): (level: ReadingLevel) => Promise<number> {
  // The server needs the collection entry before it can time the read.
  void syncPinCollection()
    .then(() => startPinReadTimer(pinId))
    .catch(() => undefined);
  return async (level) => {
    useCollection.getState().markRead(pinId, level);
    return finishPinRead(pinId, level);
  };
}
