// POST /functions/v1/award-points — the only place points are written (D55).
//   { action: 'walk', walk_id, samples }   a finished recording → distance points for its days
//   { action: 'pin_read', pin_id, level }  finished reading a collected pin → read state + points
// The app never sends a points amount: this function works it out from stored data with the rules
// in shared/src/pointsRules.ts, and every award has a unique (user, source, ref_id), so retries
// are safe. Under-18s (safety mode) get badges only: nothing is stored or awarded for them.
import { guarded, LIMITS } from '../_shared/guard.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { filterSamples } from '../_shared/scenic/gps.ts';
import {
  AwardPointsRequestSchema,
  AwardPointsResponseSchema,
  WALK_MAX_AGE_MS,
} from '../_shared/scenic/points-api.ts';
import {
  distancePointsOwed,
  hkDay,
  pinReadEarns,
  walkMetersByDay,
} from '../_shared/scenic/points.ts';
import { POINTS_RULES } from '../_shared/scenic/pointsRules.ts';

const respond = (awarded: number) => json(AwardPointsResponseSchema.parse({ awarded }));

export default {
  fetch: guarded('award-points', LIMITS.awardPoints, async (req, ctx) => {
    if (req.method === 'GET') return json({ ok: true, function: 'award-points' });
    if (req.method !== 'POST') return errorResponse('Use POST', 405);
    const uid = ctx.userClaims?.id;
    if (!uid) return errorResponse('Sign in first', 401);
    const body = await readBody(req, AwardPointsRequestSchema);
    if ('response' in body) return body.response;
    const db = ctx.supabaseAdmin; // writes the ledger, which no client may touch

    const { data: settings } = await db
      .from('user_settings')
      .select('safety_mode')
      .eq('user_id', uid)
      .maybeSingle();
    if (!settings || settings.safety_mode) {
      return errorResponse('Points are off in safety mode', 403);
    }
    const request = body.data;

    if (request.action === 'walk') {
      const now = Date.now();
      if (
        request.samples.some(
          (s) => s.timestamp > now + 5 * 60_000 || s.timestamp < now - WALK_MAX_AGE_MS,
        )
      ) {
        return errorResponse('This walk is too old, or its times are wrong', 400);
      }
      // The walk's metres per day are stored once (first request wins), then reused by retries.
      const { data: stored } = await db
        .from('walk_days')
        .select('day')
        .eq('user_id', uid)
        .eq('walk_id', request.walk_id);
      let days = (stored ?? []).map((r) => r.day as string);
      if (days.length === 0) {
        const byDay = walkMetersByDay(filterSamples(request.samples));
        const rows = Object.entries(byDay).map(([day, m]) => ({
          user_id: uid,
          walk_id: request.walk_id,
          day,
          counted_m: Math.round(m.countedM * 10) / 10,
          too_fast_m: Math.round(m.tooFastM * 10) / 10,
        }));
        if (rows.length > 0) {
          const { error } = await db.from('walk_days').upsert(rows, { ignoreDuplicates: true });
          if (error) throw new Error(`walk_days: ${error.message}`);
        }
        days = rows.map((r) => r.day);
      }

      let awarded = 0;
      for (const day of days) {
        const [walks, paid] = await Promise.all([
          db.from('walk_days').select('counted_m').eq('user_id', uid).eq('day', day),
          db
            .from('points_ledger')
            .select('amount')
            .eq('user_id', uid)
            .eq('source', 'distance')
            .eq('occurred_on', day),
        ]);
        const dayMeters = (walks.data ?? []).reduce((s, r) => s + Number(r.counted_m), 0);
        const alreadyPaid = (paid.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
        const owed = distancePointsOwed(dayMeters, alreadyPaid);
        if (owed === 0) continue;
        const { error } = await db.from('points_ledger').upsert(
          {
            user_id: uid,
            source: 'distance',
            amount: owed,
            ref_id: `walk:${request.walk_id}:${day}`,
            occurred_on: day,
          },
          { onConflict: 'user_id,source,ref_id', ignoreDuplicates: true },
        );
        if (error) throw new Error(`points_ledger: ${error.message}`);
        awarded += owed;
      }
      return respond(awarded);
    }

    // Finished reading a pin.
    const { pin_id: pinId, level } = request;
    const [entry, session, paid] = await Promise.all([
      db
        .from('collection_entries')
        .select('read_at')
        .eq('user_id', uid)
        .eq('pin_id', pinId)
        .maybeSingle(),
      db
        .from('pin_read_sessions')
        .select('opened_at')
        .eq('user_id', uid)
        .eq('pin_id', pinId)
        .maybeSingle(),
      db
        .from('points_ledger')
        .select('id')
        .eq('user_id', uid)
        .eq('source', 'pin_read')
        .eq('ref_id', pinId)
        .maybeSingle(),
    ]);
    if (!entry.data) return errorResponse('This pin is not in your collection', 400);
    if (!entry.data.read_at) {
      await db
        .from('collection_entries')
        .update({ read_at: new Date().toISOString(), read_level: level })
        .eq('user_id', uid)
        .eq('pin_id', pinId);
    }
    const earns =
      session.data !== null &&
      pinReadEarns({
        collected: true,
        openedAtMs: Date.parse(session.data.opened_at),
        finishedAtMs: Date.now(),
        alreadyAwarded: paid.data !== null,
      });
    if (!earns) return respond(0);
    const { error } = await db.from('points_ledger').upsert(
      {
        user_id: uid,
        source: 'pin_read',
        amount: POINTS_RULES.pinRead.amount,
        ref_id: pinId,
        occurred_on: hkDay(Date.now()),
      },
      { onConflict: 'user_id,source,ref_id', ignoreDuplicates: true },
    );
    if (error) throw new Error(`points_ledger: ${error.message}`);
    return respond(POINTS_RULES.pinRead.amount);
  }),
};
