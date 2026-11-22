import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { recoverInterruptedRecordings } from '@/lib/local-db';
import { useRecorder } from '@/lib/recorder';
import { refreshLocalData } from '@/lib/query-client';
import { cleanUpLeftoverShare, subscribeToFriendLocations } from '@/lib/location-sharing';
import { syncPinCollection } from '@/lib/pin-collector';
import { processUploadQueue } from '@/lib/upload-queue';
import { useAuth } from '@/providers/auth-provider';

/**
 * Keeps saved recordings flowing to the server:
 *   - on launch: turn recordings interrupted by an app crash/close into drafts (nothing is lost)
 *   - try uploading when signed in, when the app comes back to the foreground, and when the
 *     network reconnects (e.g. walking out of an MTR station)
 */
export function useBackgroundSync() {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';

  useEffect(() => {
    recoverInterruptedRecordings(useRecorder.getState().recordingId)
      .then((n) => (n > 0 ? refreshLocalData() : undefined))
      .catch((err) => console.warn('recovery failed', err));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void processUploadQueue();
    void syncPinCollection(); // pins collected offline (D54)
    // Sharing is foreground-only: a share left by a previous (closed) session is removed.
    void cleanUpLeftoverShare().catch((err) => console.warn('share cleanup failed', err));

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void processUploadQueue();
    });
    const net = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void processUploadQueue();
        void syncPinCollection();
      }
    });
    // Browsers: NetInfo didn't report the connection coming back, so recordings saved offline
    // waited until the tab was reopened. The browser's own "online" event does (D48).
    const onOnline = () => {
      void processUploadQueue();
      void syncPinCollection();
    };
    if (Platform.OS === 'web') window.addEventListener('online', onOnline);
    // Friends' live locations: one Realtime subscription for the whole app.
    const unsubscribeLocations = subscribeToFriendLocations();
    return () => {
      appState.remove();
      net();
      if (Platform.OS === 'web') window.removeEventListener('online', onOnline);
      unsubscribeLocations();
    };
  }, [signedIn]);
}
