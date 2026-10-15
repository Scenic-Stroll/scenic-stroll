/**
 * Friend codes (STROLL-7K2Q) and the shapes of the friend functions' results.
 * The code alphabet skips I, O, 0 and 1 so codes are easy to read aloud and type.
 */
import { z } from 'zod';

import { RouteStatusSchema } from './schemas.ts';

const CODE_BODY = '[A-HJ-NP-Z2-9]{4}';
export const FRIEND_CODE_PATTERN = new RegExp(`^STROLL-${CODE_BODY}$`);

/**
 * Finds a friend code in anything a person might type, paste or scan:
 * "stroll-7k2q", "STROLL 7K2Q", "7K2Q", an invite message, or a scenicstroll://friend/… link.
 */
export function parseFriendCode(input: string): string | null {
  const text = input.toUpperCase();
  const full = text.match(new RegExp(`STROLL[\\s-]*(${CODE_BODY})(?![A-Z0-9])`));
  if (full) return `STROLL-${full[1]}`;
  const bare = text.trim().match(new RegExp(`^(${CODE_BODY})$`));
  return bare ? `STROLL-${bare[1]}` : null;
}

/** What the QR code contains. Also works as a deep link once the app is built (not in Expo Go). */
export function friendLink(code: string): string {
  return `scenicstroll://friend/${code}`;
}

export function friendInviteText(code: string): string {
  return `Add me on Scenic Stroll — my friend code is ${code}. Open Friends → Add friend and enter it (or scan my QR).`;
}

// ---- RPC result rows ---------------------------------------------------------------------

export const FriendRowSchema = z.object({
  friendship_id: z.number(),
  other_id: z.string(),
  name: z.string(),
  kind: z.enum(['friend', 'incoming', 'outgoing', 'blocked']),
  points_total: z.number().nullable(),
  points_week: z.number().nullable(),
  since: z.string(),
});
export type FriendRow = z.infer<typeof FriendRowSchema>;

export const LeaderboardRowSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  points_week: z.number(),
  is_me: z.boolean(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRowSchema>;

export const ActivityRowSchema = z.object({
  route_id: z.string(),
  friend_id: z.string(),
  name: z.string(),
  title: z.string(),
  status: RouteStatusSchema,
  created_at: z.string(),
});
export type ActivityRow = z.infer<typeof ActivityRowSchema>;

export const FriendProfileSchema = z.object({
  name: z.string(),
  points_total: z.number(),
  routes_total: z.number(),
  public_routes: z.number(),
  friends_since: z.string().nullable(),
});
export type FriendProfile = z.infer<typeof FriendProfileSchema>;

export const SendRequestResultSchema = z.enum([
  'requested',
  'accepted',
  'already_friends',
  'already_requested',
]);
export type SendRequestResult = z.infer<typeof SendRequestResultSchema>;
