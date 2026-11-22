// "Report a problem" with a community route. Reports are write-only (nobody can read who reported
// what); 3 different people reporting a route hides it until the team checks it (DECISIONS D44).
import { supabase } from '@/lib/supabase';

export type ReportReason = 'wrong' | 'closed' | 'unsafe' | 'offensive' | 'other';

export const REPORT_REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'wrong', label: 'Wrong or outdated' },
  { reason: 'closed', label: 'Path closed' },
  { reason: 'unsafe', label: 'Unsafe' },
  { reason: 'offensive', label: 'Offensive' },
  { reason: 'other', label: 'Something else' },
];

/** 'sent', or 'already' if this person reported the route before. Throws on other errors. */
export async function reportRoute(
  routeId: string,
  reason: ReportReason,
): Promise<'sent' | 'already'> {
  const { error } = await supabase.from('route_reports').insert({ route_id: routeId, reason });
  if (!error) return 'sent';
  if (error.code === '23505') return 'already'; // one report per person per route
  throw new Error(error.message);
}
