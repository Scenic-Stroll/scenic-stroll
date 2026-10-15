/**
 * The signed-in user's public profile row (display name) in Supabase.
 * Points/levels are calculated on the phone for now (see getMyStats + shared/levels.ts).
 */
import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const profileKey = (userId: string | null) => ['profile', userId] as const;

export function useMyProfile() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  return useQuery({
    queryKey: profileKey(userId),
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId!)
        .maybeSingle();
      if (error) {
        console.warn('[profiles]', error);
        throw new Error('Couldn’t load your profile.');
      }
      return { displayName: (data?.display_name as string | null | undefined) ?? null };
    },
  });
}

/** Saves the display name (1–40 characters, or null to go back to "Anonymous walker"). */
export async function updateDisplayName(userId: string, name: string | null) {
  const clean = name?.trim() ? name.trim().slice(0, 40) : null;
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: clean })
    .eq('id', userId);
  if (error) {
    console.warn('[profiles] update', error);
    throw new Error('Couldn’t save your name. Check your connection and try again.');
  }
  await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
}
