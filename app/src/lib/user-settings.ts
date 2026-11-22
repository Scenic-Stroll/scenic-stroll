/**
 * Age band, consent, opt-ins and reading style (public.user_settings, D52).
 * The server is the truth; a copy is kept on the device so safety mode also applies offline and
 * the consent screen isn't shown again on every launch. Until the settings are known, the app
 * behaves as in safety mode (featureRules(null)).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CONSENT_VERSION,
  defaultReadingStyle,
  featureRules,
  UserSettingsSchema,
  type AgeBand,
  type FeatureRules,
  type ReadingLevel,
  type UserSettings,
} from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type Stored = { userId: string; settings: UserSettings } | null;

const useStore = create<{ stored: Stored; set: (s: Stored) => void }>()(
  persist((set) => ({ stored: null, set: (stored) => set({ stored }) }), {
    name: 'scenic-user-settings',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ stored: s.stored }),
  }),
);

const COLUMNS =
  'age_band, safety_mode, reading_style, research_opt_in, gov_sharing_opt_in, consent_version, consented_at';
const key = (userId: string | null) => ['user-settings', userId] as const;

async function fetchSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase.from('user_settings').select(COLUMNS).maybeSingle();
  if (error) throw new Error('Couldn’t load your settings.');
  const settings = data ? UserSettingsSchema.parse(data) : null;
  useStore.getState().set(settings ? { userId, settings } : null);
  return settings;
}

/** The signed-in user's settings: from the server when online, else the copy on the device. */
export function useUserSettings(): { settings: UserSettings | null; known: boolean } {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const stored = useStore((s) => s.stored);
  const query = useQuery({
    queryKey: key(userId),
    enabled: userId !== null,
    queryFn: () => fetchSettings(userId!),
    networkMode: 'always', // offline → fails fast and the device copy is used
    retry: 1,
  });
  const local = stored && stored.userId === userId ? stored.settings : null;
  const settings = query.data !== undefined ? query.data : local;
  return { settings, known: query.isSuccess || local !== null };
}

/** What the app may offer this user (safety mode for under-18s and while unknown). */
export function useFeatureRules(): FeatureRules {
  return featureRules(useUserSettings().settings);
}

/** For code outside React (the recorder): the rules from the last known settings. */
export function currentFeatureRules(): FeatureRules {
  return featureRules(useStore.getState().stored?.settings ?? null);
}

async function refresh(userId: string) {
  await queryClient.fetchQuery({ queryKey: key(userId), queryFn: () => fetchSettings(userId) });
}

/** The consent screen's answer. Throws a readable message if it couldn't be saved. */
export async function saveConsent(
  userId: string,
  answer: { ageBand: AgeBand; researchOptIn: boolean; govSharingOptIn: boolean },
): Promise<void> {
  const adult = answer.ageBand === 'adult';
  const fields = {
    consent_version: CONSENT_VERSION,
    // Opt-ins are offered to adults only.
    research_opt_in: adult && answer.researchOptIn,
    gov_sharing_opt_in: adult && answer.govSharingOptIn,
  };
  const { data: existing } = await supabase.from('user_settings').select('age_band').maybeSingle();
  const { error } = existing
    ? // Answering again (new consent text). The age band can only move towards safety mode.
      await supabase
        .from('user_settings')
        .update({ ...fields, ...(answer.ageBand === 'under_18' ? { age_band: 'under_18' } : {}) })
        .eq('user_id', userId)
    : await supabase.from('user_settings').insert({
        ...fields,
        age_band: answer.ageBand,
        reading_style: defaultReadingStyle(answer.ageBand),
      });
  if (error) {
    throw new Error(
      /fetch|network/i.test(error.message)
        ? 'No connection — connect to the internet to finish.'
        : 'Couldn’t save your answer. Please try again.',
    );
  }
  await refresh(userId);
}

/** Profile → Reading style. Any user can pick any style; it doesn't change safety mode. */
export async function setReadingStyle(userId: string, style: ReadingLevel): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .update({ reading_style: style })
    .eq('user_id', userId);
  if (error) throw new Error('Couldn’t save the reading style.');
  await refresh(userId);
}
