/**
 * Friends: thin wrappers around the database functions in supabase/migrations/*_friends.sql.
 * Every result is validated with the shared zod schemas; errors become readable messages.
 */
import {
  ActivityRowSchema,
  FriendProfileSchema,
  FriendRowSchema,
  LeaderboardRowSchema,
  SendRequestResultSchema,
  type SendRequestResult,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  leaderboard: ['friends', 'leaderboard'] as const,
  activity: ['friends', 'activity'] as const,
  code: ['friends', 'code'] as const,
  profile: (id: string) => ['friends', 'profile', id] as const,
};

/** Turns database errors from the friend functions into something a person can act on. */
function readable(message: string): string {
  if (/No walker has that code/i.test(message))
    return 'No walker has that code. Check it and try again.';
  if (/your own code/i.test(message))
    return 'That’s your own code — share it with a friend instead.';
  if (/Can.t send a request/i.test(message)) return 'You can’t send a request to this walker.';
  if (/Too many pending/i.test(message))
    return 'You have too many pending requests. Wait for some to be answered.';
  if (/Not friends/i.test(message)) return 'You’re not friends with this walker (any more).';
  if (/Sign in first|permission denied|JWT/i.test(message))
    return 'You’re not signed in. Check Profile → Diagnostics.';
  if (/Network request failed|fetch/i.test(message))
    return 'Can’t reach the server — check your connection.';
  return 'Something went wrong. Please try again.';
}

async function rpc<T extends z.ZodType>(
  fn: string,
  args: Record<string, unknown>,
  schema: T,
): Promise<z.infer<T>> {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured — see docs/SETUP.md.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.warn(`[${fn}]`, error);
    throw new Error(readable(error.message));
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[${fn}] unexpected result`, data, parsed.error.issues);
    throw new Error('The server sent an unexpected answer. Try again later.');
  }
  return parsed.data;
}

function useSignedIn() {
  const auth = useAuth();
  return auth.status === 'signed-in';
}

// ---- queries -----------------------------------------------------------------------------

export function useMyFriendCode() {
  return useQuery({
    queryKey: friendKeys.code,
    enabled: useSignedIn(),
    staleTime: Infinity, // a code never changes
    queryFn: () => rpc('my_friend_code', {}, z.string()),
  });
}

export function useFriendList() {
  return useQuery({
    queryKey: friendKeys.list,
    enabled: useSignedIn(),
    queryFn: () => rpc('list_friends', {}, z.array(FriendRowSchema)),
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: friendKeys.leaderboard,
    enabled: useSignedIn(),
    queryFn: () => rpc('friends_leaderboard', {}, z.array(LeaderboardRowSchema)),
  });
}

export function useFriendActivity() {
  return useQuery({
    queryKey: friendKeys.activity,
    enabled: useSignedIn(),
    queryFn: () => rpc('friend_activity', { p_limit: 30 }, z.array(ActivityRowSchema)),
  });
}

export function useFriendProfile(friendId: string) {
  return useQuery({
    queryKey: friendKeys.profile(friendId),
    enabled: useSignedIn(),
    queryFn: async () => {
      const rows = await rpc(
        'friend_profile',
        { p_friend: friendId },
        z.array(FriendProfileSchema),
      );
      if (!rows[0]) throw new Error('You’re not friends with this walker (any more).');
      return rows[0];
    },
  });
}

// ---- actions -----------------------------------------------------------------------------

const refresh = () => queryClient.invalidateQueries({ queryKey: friendKeys.all });

/** Sends a request to the owner of `code` (or accepts theirs if they already asked you). */
export async function sendFriendRequest(code: string): Promise<SendRequestResult> {
  const result = await rpc('send_friend_request', { p_code: code }, SendRequestResultSchema);
  await refresh();
  return result;
}

export async function respondToRequest(friendshipId: number, accept: boolean) {
  await rpc(
    'respond_friend_request',
    { p_friendship_id: friendshipId, p_accept: accept },
    z.unknown(),
  );
  await refresh();
}

/** Cancel my request, remove a friend, or unblock. */
export async function removeFriend(otherId: string) {
  await rpc('remove_friend', { p_other: otherId }, z.unknown());
  await refresh();
}

export async function blockUser(otherId: string) {
  await rpc('block_user', { p_other: otherId }, z.unknown());
  await refresh();
}

export const SEND_RESULT_MESSAGE: Record<SendRequestResult, string> = {
  requested: 'Request sent! They’ll see it under Requests.',
  accepted: 'They had already asked you — you’re now friends!',
  already_friends: 'You’re already friends.',
  already_requested: 'You already sent them a request.',
};
