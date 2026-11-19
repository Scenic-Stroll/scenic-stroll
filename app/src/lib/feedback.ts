// "Send feedback": a short message saved to the `feedback` table. Write-only — only the team reads
// them, in the Supabase dashboard (docs/SETUP.md §9b). At most 10 per person per hour. D47.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export type FeedbackKind = 'bug' | 'idea' | 'wrong_route' | 'other';

export const FEEDBACK_KINDS: { kind: FeedbackKind; label: string }[] = [
  { kind: 'wrong_route', label: 'A route is wrong' },
  { kind: 'bug', label: 'Something’s broken' },
  { kind: 'idea', label: 'Idea' },
  { kind: 'other', label: 'Other' },
];

export const FEEDBACK_MAX_LENGTH = 1000;

/** Throws a message people can read if it couldn't be sent. */
export async function sendFeedback(kind: FeedbackKind, message: string): Promise<void> {
  const { error } = await supabase.from('feedback').insert({
    kind,
    message: message.trim(),
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? null,
  });
  if (error) {
    // The policy refuses an 11th message within an hour.
    throw new Error(
      /row-level security/i.test(error.message)
        ? 'You’ve sent a lot of feedback this hour — thank you! Please try again later.'
        : 'Couldn’t send it. Check your connection and try again.',
    );
  }
  track('feedback-sent');
}
