/**
 * Data for the admin area (/admin): experts write pins, admins review and publish them (D53).
 * Everything goes through the normal signed-in client — the database's rules decide who may do
 * what (D51), so this file has no permission logic of its own.
 */
import type { LatLng, PinQuestion, PinSource, PlaceRef, ReadingLevel } from '@scenic/shared';
import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type PinRole = 'admin' | 'expert' | null;

export function useMyPinRole() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  return useQuery({
    queryKey: ['pin-role', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PinRole> => {
      const { data, error } = await supabase.rpc('my_pin_role');
      if (error) throw new Error('Couldn’t check your role.');
      return (data as PinRole) ?? null;
    },
  });
}

export type AdminPinRow = {
  id: string;
  title: string;
  status: 'draft' | 'in_review' | 'live' | 'paused';
  label: 'expert_verified' | 'ai_summarized';
  is_sample: boolean;
  lat: number;
  lng: number;
};

/** Pins this user may see in the admin area: their own (experts) or all (admins). */
export function useAdminPins() {
  return useQuery({
    queryKey: ['admin-pins'],
    queryFn: async (): Promise<AdminPinRow[]> => {
      const { data, error } = await supabase
        .from('pins_map')
        .select('id, title, status, label, is_sample, lat, lng')
        .order('title');
      if (error) throw new Error('Couldn’t load pins.');
      return data as AdminPinRow[];
    },
  });
}

export type AdminQuestion = PinQuestion & { id: string; status: 'in_review' | 'approved' };
export type AdminVersion = {
  id: string;
  reading_level: ReadingLevel;
  body: string;
  status: 'draft' | 'in_review' | 'approved';
  generated_by_ai: boolean;
  reviewed_at: string | null;
  questions: AdminQuestion[];
};
export type AdminSource = PinSource & { id: string };
export type AdminPin = AdminPinRow & {
  summary: string | null;
  place_kind: PlaceRef['kind'];
  place_description: string | null;
  radius_m: number;
  topics: string[];
  sdg_tags: number[];
  beyond_hk_text: string | null;
  beyond_hk_source_id: string | null;
  author_expert_id: string;
  sources: AdminSource[];
  versions: AdminVersion[];
};

const LEVEL_ORDER: ReadingLevel[] = ['adult', 'teen', 'child'];

export function useAdminPin(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-pin', id],
    enabled: !!id,
    queryFn: async (): Promise<AdminPin | null> => {
      const [where, row, sources, versions] = await Promise.all([
        supabase.from('pins_map').select('lat, lng').eq('id', id!).maybeSingle(),
        supabase
          .from('pins')
          .select(
            'id, title, status, label, is_sample, summary, place_kind, place_description, radius_m, topics, sdg_tags, beyond_hk_text, beyond_hk_source_id, author_expert_id',
          )
          .eq('id', id!)
          .maybeSingle(),
        supabase
          .from('pin_sources')
          .select('id, title, url, doi, source_db, is_open_access')
          .eq('pin_id', id!),
        supabase
          .from('pin_versions')
          .select(
            'id, reading_level, body, status, generated_by_ai, reviewed_at, pin_questions(id, prompt, options, answer, explanation, status)',
          )
          .eq('pin_id', id!),
      ]);
      if (row.error || sources.error || versions.error) throw new Error('Couldn’t load the pin.');
      if (!row.data || !where.data) return null;
      const vs = (versions.data ?? []).map((v) => {
        const { pin_questions, ...rest } = v as typeof v & { pin_questions: AdminQuestion[] };
        return { ...rest, questions: pin_questions ?? [] } as AdminVersion;
      });
      vs.sort(
        (a, b) => LEVEL_ORDER.indexOf(a.reading_level) - LEVEL_ORDER.indexOf(b.reading_level),
      );
      return {
        ...(row.data as Omit<AdminPin, 'lat' | 'lng' | 'sources' | 'versions'>),
        lat: where.data.lat as number,
        lng: where.data.lng as number,
        sources: (sources.data ?? []) as AdminSource[],
        versions: vs,
      };
    },
  });
}

export function refreshAdmin(pinId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['admin-pins'] });
  if (pinId) void queryClient.invalidateQueries({ queryKey: ['admin-pin', pinId] });
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(error?.message ? `${what}: ${error.message}` : what);
}

/** EWKT for a point: PostGIS reads this text straight into the geometry column. */
const ewkt = (p: LatLng) => `SRID=4326;POINT(${p.lng} ${p.lat})`;

export type PinDraft = {
  title: string;
  summary: string;
  point: LatLng;
  place: PlaceRef;
  radius_m: number;
  topics: string[];
  sdg_tags: number[];
};

function placeColumns(place: PlaceRef) {
  return {
    place_kind: place.kind,
    ped_build_id: place.kind === 'ped_node' ? place.build_id : null,
    ped_node_id: place.kind === 'ped_node' ? place.node_id : null,
    osm_id: place.kind === 'osm' ? place.osm_id : null,
    place_description: place.kind === 'custom' ? place.description : null,
  };
}

export async function createPin(authorId: string, draft: PinDraft): Promise<string> {
  const { data, error } = await supabase
    .from('pins')
    .insert({
      title: draft.title,
      summary: draft.summary,
      location: ewkt(draft.point),
      ...placeColumns(draft.place),
      radius_m: draft.radius_m,
      topics: draft.topics,
      sdg_tags: draft.sdg_tags,
      author_expert_id: authorId,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !data) fail('Couldn’t save the pin', error);
  refreshAdmin();
  return data.id as string;
}

export async function updatePin(
  id: string,
  fields: Partial<{
    title: string;
    summary: string;
    radius_m: number;
    topics: string[];
    sdg_tags: number[];
    status: 'draft' | 'in_review';
    beyond_hk_text: string | null;
    beyond_hk_source_id: string | null;
  }>,
) {
  const { error } = await supabase.from('pins').update(fields).eq('id', id);
  if (error) fail('Couldn’t save', error);
  refreshAdmin(id);
}

export async function deletePin(id: string) {
  const { error } = await supabase.from('pins').delete().eq('id', id);
  if (error) fail('Couldn’t delete the pin', error);
  refreshAdmin();
}

export async function addSource(pinId: string, source: PinSource): Promise<string> {
  const { data, error } = await supabase
    .from('pin_sources')
    .insert({ pin_id: pinId, ...source })
    .select('id')
    .single();
  if (error || !data) fail('Couldn’t add the source', error);
  refreshAdmin(pinId);
  return data.id as string;
}

export async function removeSource(pinId: string, sourceId: string) {
  const { error } = await supabase.from('pin_sources').delete().eq('id', sourceId);
  if (error) fail('Couldn’t remove the source', error);
  refreshAdmin(pinId);
}

export async function saveVersionBody(pinId: string, versionId: string, body: string) {
  const { error } = await supabase.from('pin_versions').update({ body }).eq('id', versionId);
  if (error) fail('Couldn’t save the text', error);
  refreshAdmin(pinId);
}

/** Approve (admins) or reject (back to draft, to be rewritten). */
export async function setVersionStatus(
  pinId: string,
  versionId: string,
  status: 'approved' | 'draft',
) {
  const { error } = await supabase.from('pin_versions').update({ status }).eq('id', versionId);
  if (error) fail('Couldn’t change the version', error);
  refreshAdmin(pinId);
}

export async function saveQuestion(pinId: string, q: AdminQuestion) {
  const { error } = await supabase
    .from('pin_questions')
    .update({
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    })
    .eq('id', q.id);
  if (error) fail('Couldn’t save the question', error);
  refreshAdmin(pinId);
}

/** Approve, or send back to review. Rejecting a question deletes it. */
export async function setQuestionStatus(
  pinId: string,
  questionId: string,
  status: 'approved' | 'rejected',
) {
  const { error } =
    status === 'rejected'
      ? await supabase.from('pin_questions').delete().eq('id', questionId)
      : await supabase.from('pin_questions').update({ status }).eq('id', questionId);
  if (error) fail('Couldn’t change the question', error);
  refreshAdmin(pinId);
}

/** Admins: set live (only when the adult version and its questions are approved). Returns the label. */
export async function publishPin(pinId: string): Promise<string> {
  const { data, error } = await supabase.rpc('publish_pin', { p_pin: pinId });
  if (error) fail('Couldn’t publish', error);
  refreshAdmin(pinId);
  return data as string;
}

export async function pausePin(pinId: string) {
  const { error } = await supabase.rpc('pause_pin', { p_pin: pinId });
  if (error) fail('Couldn’t pause', error);
  refreshAdmin(pinId);
}

/** Admins: add an expert (after checking them by hand — docs/PINS.md). */
export async function addExpert(expert: {
  user_id: string;
  display_name: string;
  field: string;
  verification_method: 'orcid' | 'org_email' | 'manual';
  orcid_id: string | null;
  admin_id: string;
}) {
  const { admin_id, ...row } = expert;
  const { error } = await supabase.from('experts').insert({
    ...row,
    verified_by: admin_id,
    verified_at: new Date().toISOString(),
  });
  if (error) fail('Couldn’t add the expert', error);
}
