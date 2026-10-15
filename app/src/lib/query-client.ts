import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single TanStack Query cache. It lives in a module (not inside a component) so code
 * outside React — like the upload queue — can tell lists to refresh.
 */
export const queryClient = new QueryClient();

/** Query keys for data stored on the phone. */
export const localKeys = {
  recordings: ['local', 'recordings'] as const,
  recording: (id: string) => ['local', 'recording', id] as const,
  pendingCount: ['local', 'pending-count'] as const,
  stats: ['local', 'stats'] as const,
};

/** Call after anything changes in the local database so every list re-reads it. */
export function refreshLocalData() {
  return queryClient.invalidateQueries({ queryKey: ['local'] });
}
