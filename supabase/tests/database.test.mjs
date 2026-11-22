// Runs every migration on a local Postgres 17 + PostGIS (PGlite, in-process, no Docker) and checks
// the security rules: who can read, write and see what. Run: npm run test:db
//
// Users are simulated the way Supabase does it: `set role authenticated` + the JWT "sub" claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'migrations');

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ROUTE = '33333333-3333-4333-8333-333333333333';

/** A short walk from Kowloon Tong Exit C1 towards YEUNG, as the app would upload it. */
const payload = (overrides = {}) => ({
  id: ROUTE,
  title: 'Exit C1 to YEUNG',
  start_label: 'Kowloon Tong Exit C1',
  end_label: null,
  show_author: false,
  duration_s: 300,
  line: [
    { lat: 22.336961, lng: 114.175531 },
    { lat: 22.3365, lng: 114.1745 },
    { lat: 22.335892, lng: 114.173197 },
  ],
  checkpoints: [
    {
      seq: 1,
      kind: 'lift',
      point: { lat: 22.3365, lng: 114.1745 },
      floor_from: 'G',
      floor_to: 'L2',
      note: null,
    },
  ],
  description: '由港鐵C出口行入又一城，搭𨋢上L2',
  ...overrides,
});

let db;

/** Runs `sql` as a signed-in user (or anon when userId is null), then switches back to admin. */
async function as(userId, sql, params = []) {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

/** What the team does in the dashboard after checking a shared route (moderation, D44). */
async function approve(...routeIds) {
  await db.query(`update public.routes set review_status = 'approved' where id = any($1)`, [
    routeIds,
  ]);
}

async function rejects(promise, pattern) {
  await assert.rejects(
    promise,
    (err) => pattern.test(err.message),
    `expected error matching ${pattern}`,
  );
}

before(async () => {
  db = new PGlite({ extensions: { postgis } });
  await db.exec(fs.readFileSync(path.join(here, 'supabase-stub.sql'), 'utf8'));
  for (const file of fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  // Signing up creates a profile through the trigger.
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB]);
});

describe('profiles', () => {
  it('are created automatically for every new user', async () => {
    const { rows } = await db.query('select count(*)::int as n from public.profiles');
    assert.equal(rows[0].n, 2);
  });

  it('users cannot give themselves points', async () => {
    await rejects(
      as(ALICE, 'update public.profiles set points = 9999 where id = $1', [ALICE]),
      /permission denied/,
    );
  });

  it('users can set their own display name but not someone else’s', async () => {
    await as(ALICE, `update public.profiles set display_name = 'Alice' where id = $1`, [ALICE]);
    const other = await as(
      ALICE,
      `update public.profiles set display_name = 'Hacked' where id = $1 returning id`,
      [BOB],
    );
    assert.equal(other.rows.length, 0);
    const { rows } = await db.query('select id, display_name from public.profiles order by id');
    assert.deepEqual(
      rows.map((r) => r.display_name),
      ['Alice', null],
    );
  });
});

describe('create_route', () => {
  it('saves the route, checkpoints and description in one call', async () => {
    const { rows } = await as(ALICE, 'select public.create_route($1::jsonb) as id', [
      JSON.stringify(payload()),
    ]);
    assert.equal(rows[0].id, ROUTE);

    const route = (
      await db.query(
        `select created_by, distance_m, extensions.st_astext(start_point) as start, public_author_id
       from public.routes where id = $1`,
        [ROUTE],
      )
    ).rows[0];
    assert.equal(route.created_by, ALICE);
    assert.ok(route.distance_m > 200 && route.distance_m < 300, `distance ${route.distance_m}`);
    assert.equal(route.start, 'POINT(114.175531 22.336961)');
    assert.equal(route.public_author_id, null); // show_author = false

    const cps = await db.query(
      'select seq, kind, floor_from, floor_to from public.route_checkpoints',
    );
    assert.deepEqual(cps.rows, [{ seq: 1, kind: 'lift', floor_from: 'G', floor_to: 'L2' }]);
    const desc = await db.query('select author_id, text from public.route_descriptions');
    assert.equal(desc.rows[0].author_id, ALICE);
  });

  it('is safe to retry (no duplicates)', async () => {
    await as(ALICE, 'select public.create_route($1::jsonb)', [JSON.stringify(payload())]);
    const { rows } = await db.query(
      `select (select count(*) from public.routes)::int as r,
              (select count(*) from public.route_checkpoints)::int as c,
              (select count(*) from public.route_descriptions)::int as d`,
    );
    assert.deepEqual(rows[0], { r: 1, c: 1, d: 1 });
  });

  it('rejects anonymous (signed-out) callers', async () => {
    await rejects(
      as(null, 'select public.create_route($1::jsonb)', [
        JSON.stringify(payload({ id: crypto.randomUUID() })),
      ]),
      /permission denied/,
    );
  });

  it('rejects routes outside Hong Kong', async () => {
    const outside = payload({
      id: crypto.randomUUID(),
      line: [
        { lat: 51.5, lng: -0.12 },
        { lat: 51.51, lng: -0.13 },
      ],
    });
    await rejects(
      as(BOB, 'select public.create_route($1::jsonb)', [JSON.stringify(outside)]),
      /Hong Kong/,
    );
  });

  it('rejects a one-point line', async () => {
    const bad = payload({ id: crypto.randomUUID(), line: [{ lat: 22.3365, lng: 114.1735 }] });
    await rejects(
      as(BOB, 'select public.create_route($1::jsonb)', [JSON.stringify(bad)]),
      /between 2 and 5000/,
    );
  });

  it('rejects an unknown checkpoint kind', async () => {
    const bad = payload({
      id: crypto.randomUUID(),
      checkpoints: [{ seq: 1, kind: 'teleporter', point: { lat: 22.3365, lng: 114.1745 } }],
    });
    await rejects(
      as(BOB, 'select public.create_route($1::jsonb)', [JSON.stringify(bad)]),
      /checkpoint_kind/,
    );
  });

  it('a failed upload leaves nothing half-saved', async () => {
    const id = crypto.randomUUID();
    const bad = payload({
      id,
      checkpoints: [{ seq: 0, kind: 'lift', point: { lat: 22.3365, lng: 114.1745 } }],
    });
    await rejects(
      as(BOB, 'select public.create_route($1::jsonb)', [JSON.stringify(bad)]),
      /check constraint/,
    );
    const { rows } = await db.query('select count(*)::int as n from public.routes where id = $1', [
      id,
    ]);
    assert.equal(rows[0].n, 0);
  });
});

describe('privacy: who created a route stays hidden', () => {
  before(() => approve(ROUTE));

  it('nobody can read routes.created_by through the API', async () => {
    await rejects(as(BOB, 'select created_by from public.routes'), /permission denied/);
    await rejects(as(null, 'select created_by from public.routes'), /permission denied/);
    await rejects(as(ALICE, 'select * from public.routes'), /permission denied/); // * includes it
  });

  it('nobody can read route_descriptions.author_id', async () => {
    await rejects(as(BOB, 'select author_id from public.route_descriptions'), /permission denied/);
  });

  it('routes_public shows the route without an author when show_author is off', async () => {
    const { rows } = await as(
      null,
      'select id, author_id, author_name, geojson from public.routes_public',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].author_id, null);
    assert.equal(rows[0].geojson.type, 'LineString');
  });

  it('turning on "show my name" reveals the display name', async () => {
    await as(ALICE, 'update public.routes set show_author = true where id = $1', [ROUTE]);
    const { rows } = await as(BOB, 'select author_id, author_name from public.routes_public');
    assert.deepEqual(rows[0], { author_id: ALICE, author_name: 'Alice' });
    await as(ALICE, 'update public.routes set show_author = false where id = $1', [ROUTE]);
    const after = await as(BOB, 'select author_id from public.routes_public');
    assert.equal(after.rows[0].author_id, null);
  });
});

describe('ownership', () => {
  it('another user cannot edit or delete my route', async () => {
    const upd = await as(
      BOB,
      `update public.routes set title = 'hacked' where id = $1 returning id`,
      [ROUTE],
    );
    const del = await as(BOB, 'delete from public.routes where id = $1 returning id', [ROUTE]);
    assert.equal(upd.rows.length, 0);
    assert.equal(del.rows.length, 0);
  });

  it('another user cannot add checkpoints to my route', async () => {
    await rejects(
      as(
        BOB,
        `insert into public.route_checkpoints (route_id, seq, point, kind)
               values ($1, 9, extensions.st_setsrid(extensions.st_makepoint(114.17, 22.33), 4326), 'stairs')`,
        [ROUTE],
      ),
      /row-level security/,
    );
  });

  it('I can rename my route; distance is recomputed by the server, not taken from me', async () => {
    const { rows } = await as(
      ALICE,
      `update public.routes set title = 'Renamed' where id = $1 returning title`,
      [ROUTE],
    );
    assert.equal(rows[0].title, 'Renamed');
    await rejects(
      as(ALICE, 'update public.routes set distance_m = 1 where id = $1', [ROUTE]),
      /permission denied/,
    );
    await rejects(
      as(ALICE, `update public.routes set status = 'verified' where id = $1`, [ROUTE]),
      /permission denied/,
    );
  });

  it('others can describe my route, but only as themselves', async () => {
    await as(BOB, 'insert into public.route_descriptions (route_id, text) values ($1, $2)', [
      ROUTE,
      'Covered all the way',
    ]);
    await rejects(
      as(
        BOB,
        'insert into public.route_descriptions (route_id, author_id, text) values ($1, $2, $3)',
        [ROUTE, ALICE, 'fake'],
      ),
      /permission denied/,
    );
  });

  it('deleting my route removes its checkpoints and descriptions', async () => {
    const { rows } = await as(ALICE, 'delete from public.routes where id = $1 returning id', [
      ROUTE,
    ]);
    assert.equal(rows.length, 1);
    const left = await db.query(
      `select (select count(*) from public.route_checkpoints)::int as c,
              (select count(*) from public.route_descriptions)::int as d`,
    );
    assert.deepEqual(left.rows[0], { c: 0, d: 0 });
  });
});

describe('rate limit', () => {
  it('allows 60 routes per hour, then refuses', async () => {
    for (let i = 0; i < 60; i++) {
      await as(BOB, 'select public.create_route($1::jsonb)', [
        JSON.stringify(payload({ id: crypto.randomUUID(), checkpoints: [], description: null })),
      ]);
    }
    await rejects(
      as(BOB, 'select public.create_route($1::jsonb)', [
        JSON.stringify(payload({ id: crypto.randomUUID() })),
      ]),
      /row-level security/,
    );
  });
});

describe('friends', () => {
  const CAROL = '44444444-4444-4444-8444-444444444444';
  const DAVE = '55555555-5555-4555-8555-555555555555';
  const ERIN = '66666666-6666-4666-8666-666666666666';
  const code = async (user) => (await as(user, 'select public.my_friend_code() as c')).rows[0].c;
  const request = async (user, c) =>
    (await as(user, 'select public.send_friend_request($1) as r', [c])).rows[0].r;
  const list = async (user) => (await as(user, 'select * from public.list_friends()')).rows;

  before(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [CAROL, DAVE, ERIN]);
  });

  it('every user gets one stable, readable friend code', async () => {
    const c1 = await code(CAROL);
    assert.match(c1, /^STROLL-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(await code(CAROL), c1);
  });

  it('signed-out users cannot use friend functions', async () => {
    await rejects(as(null, 'select public.my_friend_code()'), /permission denied/);
  });

  it('nobody can write friendships directly', async () => {
    await rejects(
      as(CAROL, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [
        CAROL,
        DAVE,
      ]),
      /permission denied/,
    );
  });

  it('request → shows as outgoing/incoming; strangers see nothing', async () => {
    assert.equal(await request(CAROL, await code(DAVE)), 'requested');
    assert.deepEqual(
      (await list(CAROL)).map((r) => r.kind),
      ['outgoing'],
    );
    assert.deepEqual(
      (await list(DAVE)).map((r) => r.kind),
      ['incoming'],
    );
    assert.equal((await as(ERIN, 'select * from public.friendships')).rows.length, 0);
    assert.equal((await list(ERIN)).length, 0);
  });

  it('cannot add yourself, and a repeat request is reported, not duplicated', async () => {
    await rejects(request(CAROL, await code(CAROL)), /your own code/);
    assert.equal(await request(CAROL, await code(DAVE)), 'already_requested');
    await rejects(request(CAROL, 'STROLL-ZZZZ'), /No walker has that code/);
  });

  it('only the addressee can accept; then both are friends (points hidden before that)', async () => {
    const id = (await list(DAVE))[0].friendship_id;
    assert.equal((await list(DAVE))[0].points_total, null);
    await rejects(
      as(CAROL, 'select public.respond_friend_request($1, true)', [id]),
      /Request not found/,
    );
    await as(DAVE, 'select public.respond_friend_request($1, true)', [id]);
    assert.deepEqual(
      (await list(CAROL)).map((r) => r.kind),
      ['friend'],
    );
    assert.deepEqual(
      (await list(DAVE)).map((r) => r.kind),
      ['friend'],
    );
    assert.equal(await request(DAVE, await code(CAROL)), 'already_friends');
  });

  it('friend profiles are for friends only', async () => {
    const p = (await as(CAROL, 'select * from public.friend_profile($1)', [DAVE])).rows[0];
    assert.match(p.name, /^Walker [A-Z0-9]{4}$/); // no display name set → code- or id-based name
    assert.ok(!p.name.includes('?'), `name has placeholder: ${p.name}`);
    await rejects(as(ERIN, 'select * from public.friend_profile($1)', [DAVE]), /Not friends/);
  });

  it('weekly leaderboard counts points (+10 route, +5 description) for me + friends only', async () => {
    const route = payload({
      id: crypto.randomUUID(),
      checkpoints: [],
      description: 'Covered all the way',
    });
    await as(DAVE, 'select public.create_route($1::jsonb)', [JSON.stringify(route)]);
    const board = (await as(CAROL, 'select * from public.friends_leaderboard()')).rows;
    assert.deepEqual(
      board.map((r) => [r.user_id, r.points_week, r.is_me]),
      [
        [DAVE, 15, false],
        [CAROL, 0, true],
      ],
    );
    assert.equal((await as(ERIN, 'select * from public.friends_leaderboard()')).rows.length, 1); // only Erin
  });

  it('activity shows a friend’s route only when they chose “show my name”', async () => {
    assert.equal((await as(CAROL, 'select * from public.friend_activity()')).rows.length, 0);
    await db.query('update public.routes set show_author = true where created_by = $1', [DAVE]);
    const feed = (await as(CAROL, 'select * from public.friend_activity()')).rows;
    assert.equal(feed.length, 1);
    assert.equal(feed[0].friend_id, DAVE);
    assert.equal((await as(ERIN, 'select * from public.friend_activity()')).rows.length, 0);
  });

  it('blocking: replaces the request, hides the block from the blocked user, stops new requests', async () => {
    assert.equal(await request(ERIN, await code(DAVE)), 'requested');
    await as(DAVE, 'select public.block_user($1)', [ERIN]);
    assert.deepEqual((await list(DAVE)).map((r) => r.kind).sort(), ['blocked', 'friend']);
    assert.equal((await list(ERIN)).length, 0); // Erin can't see she was blocked
    await rejects(request(ERIN, await code(DAVE)), /Can’t send a request/);
    await rejects(as(ERIN, 'select public.remove_friend($1)', [DAVE]), /Not found/); // can't unblock herself
    await as(ERIN, 'select public.block_user($1)', [DAVE]); // can't overwrite Dave's block
    const row = (
      await db.query(
        'select blocked_by from public.friendships where $1 in (requester_id, addressee_id) and $2 in (requester_id, addressee_id)',
        [DAVE, ERIN],
      )
    ).rows[0];
    assert.equal(row.blocked_by, DAVE);
  });

  it('the blocker can unblock; removing a friend ends the friendship', async () => {
    await as(DAVE, 'select public.remove_friend($1)', [ERIN]);
    assert.equal(await request(ERIN, await code(DAVE)), 'requested');
    await as(CAROL, 'select public.remove_friend($1)', [DAVE]);
    await rejects(as(CAROL, 'select * from public.friend_profile($1)', [DAVE]), /Not friends/);
  });
});

describe('location sharing', () => {
  const FAY = '77777777-7777-4777-8777-777777777777'; // sharer
  const GUS = '88888888-8888-4888-8888-888888888888'; // friend
  const HAL = '99999999-9999-4999-8999-999999999999'; // friend, not on the selected list
  const IVY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // stranger
  const FW = { lat: 22.337331, lng: 114.174601 }; // Festival Walk

  const start = (user, opts = {}) =>
    as(user, 'select public.start_location_share($1, $2, $3, $4, $5, $6, $7)', [
      opts.lat ?? FW.lat,
      opts.lng ?? FW.lng,
      opts.accuracy ?? 8,
      opts.precision ?? 'exact',
      opts.all ?? true,
      opts.minutes ?? 60,
      opts.recipients ?? [],
    ]);
  const sees = async (viewer) => (await as(viewer, 'select * from public.friend_locations()')).rows;
  const befriend = async (a, b) => {
    const code = (await as(b, 'select public.my_friend_code() as c')).rows[0].c;
    await as(a, 'select public.send_friend_request($1)', [code]);
    const id = (await as(b, 'select * from public.list_friends()')).rows.find(
      (r) => r.kind === 'incoming',
    ).friendship_id;
    await as(b, 'select public.respond_friend_request($1, true)', [id]);
  };

  before(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4)', [
      FAY,
      GUS,
      HAL,
      IVY,
    ]);
    await befriend(FAY, GUS);
    await befriend(FAY, HAL);
  });

  it('nothing is shared until you turn it on', async () => {
    assert.equal((await sees(GUS)).length, 0);
  });

  it('accepted friends see an exact share; strangers never do', async () => {
    await start(FAY);
    const [loc] = await sees(GUS);
    assert.equal(loc.user_id, FAY);
    assert.ok(Math.abs(loc.lat - FW.lat) < 1e-9 && Math.abs(loc.lng - FW.lng) < 1e-9);
    assert.equal((await sees(IVY)).length, 0);
    assert.equal((await as(IVY, 'select * from public.location_shares')).rows.length, 0);
  });

  it('approximate shares are snapped (~200 m) before they are stored', async () => {
    await start(FAY, { precision: 'approximate' });
    const stored = (
      await db.query(
        'select extensions.st_y(point) as lat, extensions.st_x(point) as lng, accuracy_m from public.location_shares where user_id = $1',
        [FAY],
      )
    ).rows[0];
    assert.notEqual(stored.lat, FW.lat); // the exact point is gone, even for an admin
    assert.ok(Math.abs(stored.lat / 0.002 - Math.round(stored.lat / 0.002)) < 1e-6);
    assert.ok(stored.accuracy_m >= 200);
  });

  it('"selected friends" hides the share from friends not on the list', async () => {
    await start(FAY, { all: false, recipients: [GUS] });
    assert.equal((await sees(GUS)).length, 1);
    assert.equal((await sees(HAL)).length, 0);
  });

  it('you cannot put a non-friend on your share list', async () => {
    await rejects(start(FAY, { all: false, recipients: [IVY] }), /row-level security/);
  });

  it('expired or stale (30 min without updates) shares disappear', async () => {
    await start(FAY);
    await db.query(
      `update public.location_shares set expires_at = now() - interval '1 minute' where user_id = $1`,
      [FAY],
    );
    // The trigger re-stamps updated_at, so set expiry directly via admin and check visibility:
    assert.equal((await sees(GUS)).length, 0);
    await start(FAY, { minutes: null });
    await db.exec('alter table public.location_shares disable trigger location_shares_prepare');
    await db.query(
      `update public.location_shares set updated_at = now() - interval '31 minutes' where user_id = $1`,
      [FAY],
    );
    await db.exec('alter table public.location_shares enable trigger location_shares_prepare');
    assert.equal((await sees(GUS)).length, 0);
  });

  it('updates keep working while active and report when the share has ended', async () => {
    await start(FAY);
    const ok = await as(
      FAY,
      'select public.update_location_share($1, $2, $3) as ok',
      [22.3365, 114.1735, 5],
    );
    assert.equal(ok.rows[0].ok, true);
    await as(FAY, 'select public.stop_location_share()');
    const after = await as(
      FAY,
      'select public.update_location_share($1, $2, $3) as ok',
      [22.3365, 114.1735, 5],
    );
    assert.equal(after.rows[0].ok, false);
    assert.equal((await sees(GUS)).length, 0);
  });

  it('nobody can write someone else’s location, and it must be in Hong Kong', async () => {
    await start(FAY);
    // Updating someone else's share changes nothing (RLS hides their row from your UPDATE).
    const upd = await as(
      IVY,
      'update public.location_shares set accuracy_m = 1 where user_id = $1 returning user_id',
      [FAY],
    );
    assert.equal(upd.rows.length, 0);
    // You can't choose whose share you insert: user_id has no insert grant (it defaults to you).
    await rejects(
      as(
        IVY,
        `insert into public.location_shares (user_id, point) values ($1, extensions.st_setsrid(extensions.st_makepoint(114.17, 22.33), 4326))`,
        [FAY],
      ),
      /permission denied/,
    );
    await rejects(start(FAY, { lat: 51.5, lng: -0.12 }), /Hong Kong/);
  });

  it('removing or blocking a friend stops them seeing your location immediately', async () => {
    await start(FAY);
    assert.equal((await sees(HAL)).length, 1);
    await as(FAY, 'select public.block_user($1)', [HAL]);
    assert.equal((await sees(HAL)).length, 0);
    await as(GUS, 'select public.remove_friend($1)', [FAY]);
    assert.equal((await sees(GUS)).length, 0);
  });
});

describe('checkpoints_near (floor selector)', () => {
  const JOY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const FW = { lat: 22.337331, lng: 114.174601 }; // Festival Walk
  let routeId;

  before(async () => {
    await db.query('insert into auth.users (id) values ($1)', [JOY]);
    routeId = crypto.randomUUID();
    const route = payload({
      id: routeId,
      checkpoints: [
        {
          seq: 1,
          kind: 'entrance',
          point: { lat: FW.lat, lng: FW.lng + 0.0003 },
          floor_from: null,
          floor_to: 'UG',
          note: null,
        },
        { seq: 2, kind: 'lift', point: FW, floor_from: 'UG', floor_to: 'L2', note: null },
        // ~1 km away — must not be returned for Festival Walk
        {
          seq: 3,
          kind: 'stairs',
          point: { lat: 22.3465, lng: 114.1745 },
          floor_from: 'G',
          floor_to: 'L1',
          note: null,
        },
      ],
    });
    await as(JOY, 'select public.create_route($1::jsonb)', [JSON.stringify(route)]);
    await approve(routeId);
  });

  it('returns checkpoints within the radius, with floors, for signed-out users too', async () => {
    const rows = (
      await as(null, 'select * from public.checkpoints_near($1, $2, 150)', [FW.lat, FW.lng])
    ).rows;
    assert.deepEqual(rows.map((r) => r.kind).sort(), ['entrance', 'lift']);
    const lift = rows.find((r) => r.kind === 'lift');
    assert.equal(lift.floor_from, 'UG');
    assert.equal(lift.floor_to, 'L2');
  });

  it('leaves out checkpoints of flagged routes', async () => {
    await db.query(`update public.routes set status = 'flagged' where id = $1`, [routeId]);
    const rows = (
      await as(null, 'select * from public.checkpoints_near($1, $2, 150)', [FW.lat, FW.lng])
    ).rows;
    assert.equal(rows.length, 0);
    await db.query(`update public.routes set status = 'unverified' where id = $1`, [routeId]);
  });

  it('caps the radius at 500 m', async () => {
    const rows = (
      await as(null, 'select * from public.checkpoints_near($1, $2, 100000)', [FW.lat, FW.lng])
    ).rows;
    assert.equal(
      rows.some((r) => r.kind === 'stairs'),
      false,
    );
  });
});

describe('conditions_cache (HKO weather cache)', () => {
  it('is invisible to app users, signed in or not', async () => {
    await db.query(
      `insert into public.conditions_cache (feed, payload) values ('warnsum', '{}'::jsonb)`,
    );
    for (const user of [null, ALICE]) {
      await assert.rejects(as(user, 'select * from public.conditions_cache'), /permission denied/);
      await assert.rejects(
        as(user, `update public.conditions_cache set payload = '{"fake":1}'::jsonb`),
        /permission denied/,
      );
    }
  });

  it('only accepts the two HKO feeds we use', async () => {
    await assert.rejects(
      db.query(`insert into public.conditions_cache (feed, payload) values ('other', '{}')`),
      /check/,
    );
  });
});

describe('walking graph (graph_builds, ped_nodes, ped_edges + loader)', () => {
  const KEY = 'test-loader-key-0123456789abcdef';
  const BBOX = { minLat: 22.33, maxLat: 22.34, minLng: 114.17, maxLng: 114.18 };
  const node = (id, lng, kind = 'street') => ({
    id,
    lng,
    lat: 22.335,
    z: 10,
    level: null,
    kind,
    is_entrance: false,
  });
  const edge = (id, source, target, extra = {}) => ({
    id,
    source,
    target,
    coords: [
      [114.171 + source / 1000, 22.335],
      [114.171 + target / 1000, 22.335],
    ],
    length_m: 100,
    kind: 'footway',
    covered: false,
    indoor: false,
    air_conditioned: false,
    step_free: 'yes',
    slope_pct: 0,
    z_from: 10,
    z_to: 10,
    level_from: null,
    level_to: null,
    crossing_wait_s: 0,
    opening_hours: null,
    tree_cover_pct: null,
    data_source: 'lands_3dpn',
    confidence: 0.9,
    bidirectional: true,
    name_en: 'Test',
    name_zh: null,
    source_ref: String(id),
    ...extra,
  });
  const load = async (key, nodes, edges) => {
    const build = (
      await as(ALICE, `select public.graph_begin($1, 'lands_3dpn', '2026-10-16', $2) as id`, [
        key,
        BBOX,
      ])
    ).rows[0].id;
    await as(ALICE, 'select public.graph_add($1, $2, $3, $4)', [
      key,
      build,
      JSON.stringify(nodes),
      JSON.stringify(edges),
    ]);
    return build;
  };

  before(async () => {
    await db.query(
      `insert into private.graph_loader_keys (key_hash, expires_at) values (sha256(convert_to($1, 'UTF8')), now() + interval '1 day')`,
      [KEY],
    );
  });

  it('refuses to load without a valid key, and anon cannot even call the loader', async () => {
    await assert.rejects(
      as(ALICE, `select public.graph_begin('wrong', 'lands_3dpn', 'x', $1)`, [BBOX]),
      /loader key/,
    );
    await assert.rejects(
      as(null, `select public.graph_begin($1, 'lands_3dpn', 'x', $2)`, [KEY, BBOX]),
      /permission denied/,
    );
  });

  it('refuses an expired key', async () => {
    await db.query(
      `insert into private.graph_loader_keys (key_hash, expires_at) values (sha256(convert_to('old-key', 'UTF8')), now() - interval '1 minute')`,
    );
    await assert.rejects(
      as(ALICE, `select public.graph_begin('old-key', 'lands_3dpn', 'x', $1)`, [BBOX]),
      /loader key/,
    );
  });

  it('loads a build, activates it, and everyone can read it', async () => {
    const build = await load(
      KEY,
      [node(0, 114.171), node(1, 114.172), node(2, 114.173)],
      [edge(0, 0, 1), edge(1, 1, 2, { kind: 'stairs', step_free: 'no' })],
    );
    const result = (
      await as(ALICE, 'select public.graph_activate($1, $2, $3) as r', [
        KEY,
        build,
        { components: 1 },
      ])
    ).rows[0].r;
    assert.deepEqual(result, { build_id: Number(build), nodes: 3, edges: 2 });
    const edges = (
      await as(
        null,
        'select kind, step_free, round(extensions.st_length(geom::extensions.geography)) as m from public.ped_edges order by id',
      )
    ).rows;
    assert.deepEqual(
      edges.map((e) => e.kind),
      ['footway', 'stairs'],
    );
    assert.ok(
      edges[0].m > 90 && edges[0].m < 115,
      `edge geometry should be ~103 m, got ${edges[0].m}`,
    );
    const active = (
      await as(null, `select status, node_count from public.graph_builds where status = 'active'`)
    ).rows;
    assert.deepEqual(active, [{ status: 'active', node_count: 3 }]);
  });

  it('nobody can write the graph tables directly', async () => {
    for (const user of [null, ALICE]) {
      await assert.rejects(as(user, 'delete from public.ped_edges'), /permission denied/);
      await assert.rejects(
        as(user, `update public.graph_builds set status = 'retired'`),
        /permission denied/,
      );
    }
  });

  it('a new build replaces the old one only when activated, and the old rows are removed', async () => {
    const before = (await db.query(`select id from public.graph_builds where status = 'active'`))
      .rows[0].id;
    const build = await load(KEY, [node(0, 114.171), node(1, 114.172)], [edge(0, 0, 1)]);
    // still loading → the old build is still the active one
    assert.equal(
      (await db.query(`select id from public.graph_builds where status = 'active'`)).rows[0].id,
      before,
    );
    await as(ALICE, 'select public.graph_activate($1, $2, $3)', [KEY, build, {}]);
    const counts = (
      await db.query('select build_id, count(*)::int as n from public.ped_edges group by build_id')
    ).rows;
    assert.deepEqual(counts, [{ build_id: build, n: 1 }]);
    assert.equal(
      (await db.query(`select status from public.graph_builds where id = $1`, [before])).rows[0]
        .status,
      'retired',
    );
  });

  it('rejects edges that point at missing nodes, and empty builds', async () => {
    await assert.rejects(load(KEY, [node(0, 114.171)], [edge(0, 0, 5)]), /foreign key/);
    const empty = (
      await as(ALICE, `select public.graph_begin($1, 'lands_3dpn', 'x', $2) as id`, [KEY, BBOX])
    ).rows[0].id;
    await assert.rejects(
      as(ALICE, 'select public.graph_activate($1, $2, $3)', [KEY, empty, {}]),
      /empty/,
    );
  });
});

describe('walking_graph_export (for smart-route)', () => {
  it('returns the active build as compact arrays that shared/src/graph-export.ts can read', async () => {
    const out = (await as(null, 'select public.walking_graph_export() as g')).rows[0].g;
    assert.equal(out.source, 'lands_3dpn');
    assert.ok(out.nodes.length > 0 && out.edges.length > 0);
    const [id, source, target, length, kind] = out.edges[0];
    assert.equal(typeof id, 'number');
    assert.equal(typeof source, 'number');
    assert.equal(typeof target, 'number');
    assert.ok(length > 0);
    assert.equal(kind, 'footway');
    assert.equal(out.edges[0].length, 24, 'edge tuple has 24 fields (22 = shade, 23 = feedback)');
    assert.equal(typeof out.edges[0][18], 'string', 'field 18 is the encoded polyline');
    assert.equal(out.nodes[0].length, 5);
  });
});

describe('walking_graph_export with a box', () => {
  it('returns only edges in the box, with the nodes they use', async () => {
    const all = (await as(null, 'select public.walking_graph_export() as g')).rows[0].g;
    // A tiny box far away from the test graph: nothing in it.
    const none = (
      await as(null, 'select public.walking_graph_export(114.0, 22.2, 114.001, 22.201) as g')
    ).rows[0].g;
    assert.ok(all.edges.length > 0);
    assert.equal(none.edges.length, 0);
    assert.equal(none.nodes.length, 0);
    // A box around the whole test graph: everything.
    const box = (
      await as(null, 'select public.walking_graph_export(114.16, 22.33, 114.19, 22.34) as g')
    ).rows[0].g;
    assert.equal(box.edges.length, all.edges.length);
    const nodeIds = new Set(box.nodes.map((n) => n[0]));
    for (const e of box.edges) assert.ok(nodeIds.has(e[1]) && nodeIds.has(e[2]));
  });
});

describe('walking graph shade', () => {
  const KEY = 'test-loader-key-0123456789abcdef'; // registered in the walking graph tests above

  it('the loader sets shade per edge, and the export includes it with the day it is for', async () => {
    const build = (await db.query(`select id from public.graph_builds where status = 'active'`))
      .rows[0].id;
    const edgeId = (await db.query('select id from public.ped_edges limit 1')).rows[0].id;
    const shade = Array.from({ length: 25 }, (_, i) => i * 4);
    const n = (
      await as(ALICE, 'select public.graph_set_shade($1, $2, $3, $4, $5, $6) as n', [
        KEY,
        build,
        '2026-10-16',
        420,
        30,
        JSON.stringify([[edgeId, shade, 12]]),
      ])
    ).rows[0].n;
    assert.equal(n, 1);
    const out = (await as(null, 'select public.walking_graph_export() as g')).rows[0].g;
    assert.deepEqual(out.shade, { date: '2026-10-16', first_min: 420, bucket_min: 30 });
    const edge = out.edges.find((e) => e[0] === edgeId);
    assert.equal(edge.length, 24, 'shade is field 22 (23 = walker feedback, step 7)');
    assert.deepEqual(edge[22], shade);
  });

  it('refuses without the loader key, and nobody can write shade directly', async () => {
    await assert.rejects(
      as(
        ALICE,
        `select public.graph_set_shade('nope', 1, '2026-10-16', 420::smallint, 30::smallint, '[]')`,
      ),
      /loader key/,
    );
    await assert.rejects(
      as(ALICE, 'update public.ped_edges set shade_pct = null'),
      /permission denied/,
    );
  });
});

describe('path reports ("this path is blocked")', () => {
  // The active test graph from the walking graph tests: edges along lat 22.335 near lng 114.171–114.175.
  const ON_PATH = [22.33501, 114.1715];

  it('snaps a report to the nearest edge, and signed-in users can read it (without a reporter)', async () => {
    const r = (await as(ALICE, 'select * from public.report_blocked_path($1, $2)', ON_PATH))
      .rows[0];
    assert.ok(r.id && Number.isInteger(r.edge_id));
    const seen = (await as(BOB, 'select * from public.path_reports')).rows;
    assert.equal(seen.length, 1);
    assert.equal(seen[0].edge_id, r.edge_id);
    assert.ok(!('user_id' in seen[0]), 'no reporter column in the public table');
    await rejects(as(BOB, 'select * from private.path_report_authors'), /permission denied/);
    await rejects(as(null, 'select * from public.path_reports'), /permission denied/);
  });

  it('a second report on the same path extends it instead of duplicating', async () => {
    const before = (await db.query('select id, expires_at from public.path_reports')).rows;
    const r = (await as(BOB, 'select * from public.report_blocked_path($1, $2)', ON_PATH)).rows[0];
    assert.equal(r.id, before[0].id);
    const { rows } = await db.query('select count(*)::int as n from public.path_reports');
    assert.equal(rows[0].n, 1);
  });

  it('refuses points far from any path, unknown reasons and signed-out users', async () => {
    await rejects(
      as(ALICE, 'select * from public.report_blocked_path(22.3400, 114.1715)'),
      /No path within 30 m/,
    );
    await rejects(
      as(ALICE, `select * from public.report_blocked_path($1, $2, 'ugly')`, ON_PATH),
      /Reason must be/,
    );
    await rejects(
      as(null, 'select * from public.report_blocked_path($1, $2)', ON_PATH),
      /permission denied/,
    );
  });

  it('nobody can write reports directly', async () => {
    await rejects(
      as(ALICE, "update public.path_reports set expires_at = now() + interval '1 year'"),
      /permission denied/,
    );
    await rejects(as(ALICE, 'delete from public.path_reports'), /permission denied/);
  });

  it('"clear my reports" keeps reports someone else confirmed, removes my own', async () => {
    // Alice + Bob both reported the first one → it stays when Alice clears hers.
    assert.equal((await as(ALICE, 'select public.clear_my_path_reports() as n')).rows[0].n, 0);
    // A report only Bob made (on a second edge, added here 500 m away) → removed.
    await db.exec(`
      insert into public.ped_nodes (build_id, id, geom, z_m, kind)
      select b.id, n.id, extensions.st_setsrid(extensions.st_makepoint(n.lng, 22.3395), 4326), 10, 'street'
      from public.graph_builds b, (values (9001, 114.1700), (9002, 114.1710)) as n(id, lng)
      where b.status = 'active';
      insert into public.ped_edges (build_id, id, source, target, geom, length_m, kind, covered, indoor,
        air_conditioned, step_free, data_source, confidence, bidirectional)
      select b.id, 9001, 9001, 9002,
        extensions.st_setsrid(extensions.st_makeline(extensions.st_makepoint(114.1700, 22.3395),
          extensions.st_makepoint(114.1710, 22.3395)), 4326),
        103, 'footway', false, false, false, 'yes', 'lands_3dpn', 0.9, true
      from public.graph_builds b where b.status = 'active';`);
    const other = { lat: 22.3395, lng: 114.1705 };
    await as(BOB, 'select * from public.report_blocked_path($1, $2)', [other.lat, other.lng]);
    assert.equal((await as(BOB, 'select public.clear_my_path_reports() as n')).rows[0].n, 1);
    const { rows } = await db.query('select count(*)::int as n from public.path_reports');
    assert.equal(rows[0].n, 1);
  });

  it('expired reports are hidden', async () => {
    await db.query(`update public.path_reports set expires_at = now() - interval '1 minute'`);
    assert.equal((await as(BOB, 'select * from public.path_reports')).rows.length, 0);
  });

  it('allows 10 reports per hour per person, then refuses', async () => {
    // Alice has made 1 so far; 9 more (re-reports count too) are fine, the 11th is refused.
    for (let i = 0; i < 9; i++) {
      await as(ALICE, 'select * from public.report_blocked_path($1, $2)', ON_PATH);
    }
    await rejects(
      as(ALICE, 'select * from public.report_blocked_path($1, $2)', ON_PATH),
      /Too many reports/,
    );
  });
});

describe('walk feedback ("was it sheltered as promised?")', () => {
  const WALK_A = '44444444-4444-4444-8444-444444444441';
  const WALK_B = '44444444-4444-4444-8444-444444444442';
  let build;
  let edges;
  const submit = (user, walk, aspect, verdict, simulated = false, buildId = build) =>
    as(user, 'select public.submit_walk_feedback($1, $2, $3, $4, $5, $6, $7) as n', [
      walk,
      buildId,
      edges,
      'sheltered',
      aspect,
      verdict,
      simulated,
    ]).then((r) => r.rows[0].n);
  const counts = async () =>
    (
      await as(
        BOB,
        `select edge_id, ups, partly, downs from public.edge_feedback where aspect = 'overall' order by edge_id`,
      )
    ).rows;

  before(async () => {
    build = (await db.query(`select id from public.graph_builds where status = 'active'`)).rows[0]
      .id;
    edges = (
      await db.query('select id from public.ped_edges where build_id = $1 order by id', [build])
    ).rows.map((r) => r.id);
  });

  it('a 👍 counts once per path; answering the same walk again replaces it', async () => {
    assert.equal(await submit(ALICE, WALK_A, 'overall', 'yes'), edges.length);
    assert.ok((await counts()).every((c) => c.ups === 1 && c.downs === 0));
    assert.equal(await submit(ALICE, WALK_A, 'overall', 'no'), edges.length);
    assert.ok((await counts()).every((c) => c.ups === 0 && c.downs === 1));
  });

  it('one vote per person per path: a second walk by the same person replaces, others add', async () => {
    await submit(ALICE, WALK_B, 'overall', 'no');
    assert.ok((await counts()).every((c) => c.downs === 1));
    await submit(BOB, WALK_A, 'overall', 'partly');
    assert.ok((await counts()).every((c) => c.downs === 1 && c.partly === 1));
  });

  it('the graph export carries the counts per edge (field 23) for smart-route', async () => {
    const out = (await as(BOB, 'select public.walking_graph_export() as g')).rows[0].g;
    const edge = out.edges.find((e) => e[0] === edges[0]);
    assert.deepEqual(edge[23], { overall: [0, 1, 1] }); // [ups, partly, downs]
  });

  it('only paths the question is about get a vote (shelter → covered/indoor paths)', async () => {
    // The test graph has no covered paths.
    assert.equal(await submit(BOB, WALK_B, 'shelter', 'no'), 0);
  });

  it('demo (simulated) walks are recorded but never counted', async () => {
    const before = await counts();
    assert.equal(
      await submit(BOB, '44444444-4444-4444-8444-444444444443', 'overall', 'yes', true),
      0,
    );
    assert.deepEqual(await counts(), before);
  });

  it('refuses bad answers, old maps and signed-out users', async () => {
    await rejects(submit(ALICE, WALK_A, 'vibes', 'yes'), /Unknown feedback aspect/);
    await rejects(submit(ALICE, WALK_A, 'overall', 'maybe'), /yes, partly or no/);
    await rejects(submit(ALICE, WALK_A, 'overall', 'yes', false, 999999), /out of date/);
    await rejects(submit(null, WALK_A, 'overall', 'yes'), /permission denied/);
  });

  it('voters stay private, counts are public, and nobody writes the counts directly', async () => {
    await rejects(as(ALICE, 'select * from private.edge_votes'), /permission denied/);
    await rejects(as(ALICE, 'select * from private.walk_feedback'), /permission denied/);
    await rejects(as(ALICE, 'update public.edge_feedback set ups = 100'), /permission denied/);
    // The counts themselves are anonymous: anyone may read them (the graph export includes them).
    assert.ok((await as(null, 'select * from public.edge_feedback')).rows.length > 0);
  });

  it('allows 20 answered walks an hour', async () => {
    // Alice has answered 2 walks; 18 more are fine, the next is refused.
    for (let i = 0; i < 18; i++) {
      await submit(
        ALICE,
        `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
        'overall',
        'yes',
      );
    }
    await rejects(
      submit(ALICE, '55555555-5555-4555-8555-999999999999', 'overall', 'yes'),
      /Too many answers/,
    );
  });
});

describe('community routes saved from a planned route', () => {
  const PLANNED = '66666666-6666-4666-8666-666666666666';
  // A fresh user: Bob used up his 60 routes an hour in the rate-limit test.
  const CAROL = '99999999-9999-4999-8999-999999999991';
  before(async () => {
    await db.query('insert into auth.users (id) values ($1)', [CAROL]);
  });

  it('origin defaults to "recorded" and can be "planned"; routes_public shows it', async () => {
    const RECORDED = '99999999-9999-4999-8999-999999999992';
    await as(CAROL, 'select public.create_route($1)', [payload({ id: RECORDED })]);
    await as(CAROL, 'select public.create_route($1)', [
      payload({ id: PLANNED, origin: 'planned' }),
    ]);
    await approve(RECORDED, PLANNED);
    const rows = (
      await as(
        null,
        'select id, origin from public.routes_public where id in ($1, $2) order by id',
        [RECORDED, PLANNED],
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.origin),
      ['planned', 'recorded'], // ordered by id: 6666… then 9999…
    );
  });

  it('rejects an unknown origin', async () => {
    await rejects(
      as(CAROL, 'select public.create_route($1)', [
        payload({ id: '77777777-7777-4777-8777-777777777777', origin: 'invented' }),
      ]),
      /routes_origin_check/,
    );
  });
});

describe('shade_layer ("Shade now" map layer)', () => {
  const BOX = [114.16, 22.33, 114.19, 22.345];
  const layer = (bucket) =>
    as(null, 'select public.shade_layer($1, $2, $3, $4, $5) as l', [bucket, ...BOX]).then(
      (r) => r.rows[0].l,
    );

  it('classes paths by shade at that half hour, for signed-out users too', async () => {
    // The shade test above set one edge to 0, 4, 8 … 96 % across the 25 buckets.
    const early = await layer(0); // 0 % shaded
    const late = await layer(24); // 96 % shaded
    assert.equal(early.date, '2026-10-16');
    assert.ok(early.lines.some(([cls]) => cls === 'sun'));
    assert.ok(late.lines.some(([cls]) => cls === 'shade'));
    assert.equal(typeof late.lines[0][1], 'string', 'encoded polyline');
  });

  it('draws nothing for a bucket outside the day, or an empty box', async () => {
    assert.deepEqual((await layer(99)).lines, []);
    const empty = (await as(null, 'select public.shade_layer(0, 120, 30, 120.01, 30.01) as l'))
      .rows[0].l;
    assert.deepEqual(empty.lines, []);
  });
});

describe('api_cache / api_calls (paid routing API cost control)', () => {
  it('are invisible to app users, signed in or not', async () => {
    for (const user of [ALICE, null]) {
      await rejects(as(user, 'select * from public.api_cache'), /permission denied/);
      await rejects(as(user, 'select * from public.api_calls'), /permission denied/);
      await rejects(
        as(user, `insert into public.api_calls (api, ok) values ('google_routes_drive', true)`),
        /permission denied/,
      );
    }
  });
});

describe('mtr_fares (fallback transit planner)', () => {
  it('is server-only', async () => {
    await rejects(as(ALICE, 'select * from public.mtr_fares'), /permission denied/);
    await rejects(as(null, 'select * from public.mtr_fares'), /permission denied/);
  });
});

describe('public launch safety (moderation, reports, rate limits — D44)', () => {
  const KIM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'; // shares a route
  const LEO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'; // another user
  const MIA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  const NED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
  const SHARED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
  before(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4)', [
      KIM,
      LEO,
      MIA,
      NED,
    ]);
    await as(KIM, 'select public.create_route($1::jsonb)', [
      JSON.stringify(payload({ id: SHARED, description: 'Lift to L2, covered all the way' })),
    ]);
  });

  const visibleTo = async (user) =>
    (await as(user, 'select id from public.routes_public where id = $1', [SHARED])).rows.length;

  it('a newly shared route is hidden from everyone but its author until approved', async () => {
    assert.equal(await visibleTo(KIM), 1);
    assert.equal(await visibleTo(LEO), 0);
    assert.equal(await visibleTo(null), 0); // signed-out browser
    // Its checkpoints and description don't leak either.
    const cps = await as(null, 'select 1 from public.route_checkpoints where route_id = $1', [
      SHARED,
    ]);
    assert.equal(cps.rows.length, 0);
    const desc = await as(LEO, 'select 1 from public.route_descriptions where route_id = $1', [
      SHARED,
    ]);
    assert.equal(desc.rows.length, 0);
  });

  it('users can see the review status but cannot approve their own route', async () => {
    const { rows } = await as(KIM, 'select review_status from public.routes where id = $1', [
      SHARED,
    ]);
    assert.equal(rows[0].review_status, 'pending');
    await rejects(
      as(KIM, `update public.routes set review_status = 'approved' where id = $1`, [SHARED]),
      /permission denied/,
    );
  });

  it('once the team approves it, everyone sees it', async () => {
    await approve(SHARED);
    assert.equal(await visibleTo(LEO), 1);
    assert.equal(await visibleTo(null), 1);
  });

  it('reports are write-only, one per person, and signed-out users cannot report', async () => {
    await as(LEO, 'insert into public.route_reports (route_id, reason) values ($1, $2)', [
      SHARED,
      'wrong',
    ]);
    await rejects(
      as(LEO, 'insert into public.route_reports (route_id, reason) values ($1, $2)', [
        SHARED,
        'other',
      ]),
      /duplicate key/,
    );
    await rejects(as(LEO, 'select * from public.route_reports'), /permission denied/);
    await rejects(
      as(null, 'insert into public.route_reports (route_id, reason) values ($1, $2)', [
        SHARED,
        'wrong',
      ]),
      /permission denied/,
    );
    assert.equal(await visibleTo(LEO), 1); // one report alone doesn't hide it
  });

  it('three different reporters hide the route (flagged) for everyone but its author', async () => {
    for (const user of [MIA, NED]) {
      await as(user, 'insert into public.route_reports (route_id, reason) values ($1, $2)', [
        SHARED,
        'unsafe',
      ]);
    }
    assert.equal(await visibleTo(LEO), 0);
    assert.equal(await visibleTo(null), 0);
    assert.equal(await visibleTo(KIM), 1);
  });

  it('a signed-out browser cannot read anyone’s location or private profile data', async () => {
    // Either refused outright or nothing comes back — both mean nothing leaks.
    const nothingFor = async (sql) => {
      try {
        assert.equal((await as(null, sql)).rows.length, 0, sql);
      } catch (err) {
        assert.match(err.message, /permission denied/, sql);
      }
    };
    await as(KIM, 'select public.start_location_share($1, $2, 8, $3, true, 60, $4)', [
      22.3373,
      114.1746,
      'exact',
      [],
    ]);
    await nothingFor('select * from public.location_shares');
    await nothingFor('select * from public.friend_locations()');
    await nothingFor('select * from public.location_share_recipients');
    await nothingFor('select * from public.friendships');
    await rejects(as(null, 'select created_by from public.routes'), /permission denied/);
  });

  it('only the server (service role) can count rate limits', async () => {
    await rejects(
      as(LEO, `select public.rate_limit_hit(array['x'], array[5], 60)`),
      /permission denied/,
    );
    await rejects(
      as(null, `select public.rate_limit_hit(array['x'], array[5], 60)`),
      /permission denied/,
    );
    const hit = async () =>
      (
        await db.query(
          `select public.rate_limit_hit(array['test:user:1', 'test:ip:1'], array[3, 100], 60) as over`,
        )
      ).rows[0].over;
    assert.deepEqual([await hit(), await hit(), await hit()], [0, 0, 0]);
    assert.equal(await hit(), 1); // 4th request this minute: over the first bucket's limit of 3
  });
});

describe('feedback form (web step 7, D47)', () => {
  const send = (user, message, kind = 'idea') =>
    as(user, 'insert into public.feedback (kind, message, platform) values ($1, $2, $3)', [
      kind,
      message,
      'web',
    ]);

  it('signed-in users can send feedback, but nobody can read it back', async () => {
    await send(ALICE, 'Please add Mong Kok');
    await rejects(as(ALICE, 'select * from public.feedback'), /permission denied/);
    await rejects(as(BOB, 'select message from public.feedback'), /permission denied/);
    await rejects(as(null, 'select message from public.feedback'), /permission denied/);
  });

  it('signed-out visitors cannot send feedback', async () => {
    await rejects(send(null, 'spam'), /permission denied/);
  });

  it('you cannot send feedback in someone else’s name', async () => {
    await rejects(
      as(ALICE, 'insert into public.feedback (user_id, kind, message) values ($1, $2, $3)', [
        BOB,
        'bug',
        'pretending to be Bob',
      ]),
      /permission denied/,
    );
  });

  it('rejects empty, too long or unknown kinds of feedback', async () => {
    await rejects(send(BOB, '   '), /check constraint/);
    await rejects(send(BOB, 'x'.repeat(1001)), /check constraint/);
    await rejects(send(BOB, 'hello', 'praise'), /check constraint/);
  });

  it('allows 10 messages per hour per person, then refuses', async () => {
    for (let i = 0; i < 10; i++) await send(BOB, `message ${i}`, 'wrong_route');
    await rejects(send(BOB, 'one too many'), /row-level security/);
    // Others are not affected.
    await send(ALICE, 'still fine');
  });
});

describe('knowledge pins (pins phase 1, D51)', () => {
  const ADMIN = 'c0000000-0000-4000-8000-000000000001';
  const EXPERT = 'c0000000-0000-4000-8000-000000000002';
  const READER = 'c0000000-0000-4000-8000-000000000003'; // an adult user
  const KID = 'c0000000-0000-4000-8000-000000000004'; // under 18
  const NEWBIE = 'c0000000-0000-4000-8000-000000000005'; // signed in, no settings yet
  let pin; // a pin by EXPERT that goes live during these tests

  const newPin = async (title = 'Why Kent Road is in Kowloon') =>
    (
      await as(
        EXPERT,
        `insert into public.pins (title, location, place_kind, place_description, author_expert_id, status)
         values ($1, extensions.st_setsrid(extensions.st_makepoint(114.1745, 22.3372), 4326),
                 'custom', 'Street sign at the corner of Kent Road', $2, 'in_review')
         returning id`,
        [title, EXPERT],
      )
    ).rows[0].id;
  const addVersion = async (who, pinId, level) =>
    (
      await as(
        who,
        `insert into public.pin_versions (pin_id, reading_level, body, generated_by_ai)
         values ($1, $2, $3, true) returning id`,
        [pinId, level, `A ${level} reading version of the pin.`],
      )
    ).rows[0].id;
  const addQuestion = async (who, versionId) =>
    (
      await as(
        who,
        `insert into public.pin_questions (pin_version_id, prompt, options, answer, explanation)
         values ($1, 'Which side of the boundary is it on?', '["Kowloon","New Kowloon"]', 'Kowloon',
                 'Boundary Street was the 1860 limit.') returning id`,
        [versionId],
      )
    ).rows[0].id;

  before(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)', [
      ADMIN,
      EXPERT,
      READER,
      KID,
      NEWBIE,
    ]);
    // What the team does by hand in the dashboard (docs/PINS.md).
    await db.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
    await as(
      ADMIN,
      `insert into public.experts (user_id, display_name, field, verification_method, orcid_id, verified_by, verified_at)
       values ($1, 'Dr Lee', 'Urban history', 'orcid', '0000-0002-1825-0097', $2, now())`,
      [EXPERT, ADMIN],
    );
    await as(
      READER,
      `insert into public.user_settings (age_band, consent_version) values ('adult', 'v1')`,
    );
    await as(
      KID,
      `insert into public.user_settings (age_band, consent_version) values ('under_18', 'v1')`,
    );
  });

  it('only admins add experts; everyone signed in sees names, not ORCID iDs', async () => {
    await rejects(
      as(
        READER,
        `insert into public.experts (user_id, display_name, field, verification_method)
         values ($1, 'Me', 'Anything', 'manual')`,
        [READER],
      ),
      /row-level security/,
    );
    const { rows } = await as(READER, 'select display_name, field from public.experts');
    assert.deepEqual(rows, [{ display_name: 'Dr Lee', field: 'Urban history' }]);
    await rejects(as(READER, 'select orcid_id from public.experts'), /permission denied/);
  });

  it('only experts create pins, as themselves, and never straight to live', async () => {
    await rejects(
      as(
        READER,
        `insert into public.pins (title, location, place_kind, place_description, author_expert_id)
         values ('Mine', extensions.st_setsrid(extensions.st_makepoint(114.17, 22.33), 4326),
                 'custom', 'Somewhere nice', $1)`,
        [READER],
      ),
      /row-level security/,
    );
    await rejects(
      as(
        EXPERT,
        `insert into public.pins (title, location, place_kind, place_description, author_expert_id, status)
         values ('Too soon', extensions.st_setsrid(extensions.st_makepoint(114.17, 22.33), 4326),
                 'custom', 'Somewhere nice', $1, 'live')`,
        [EXPERT],
      ),
      /row-level security|start as draft/,
    );
    pin = await newPin();
    assert.ok(pin);
  });

  it('a custom place needs a description; the radius stays within 30–50 m', async () => {
    await rejects(
      as(
        EXPERT,
        `insert into public.pins (title, location, place_kind, author_expert_id)
         values ('No description', extensions.st_setsrid(extensions.st_makepoint(114.17, 22.33), 4326),
                 'custom', $1)`,
        [EXPERT],
      ),
      /check constraint/,
    );
    await rejects(
      as(EXPERT, 'update public.pins set radius_m = 80 where id = $1', [pin]),
      /check constraint/,
    );
  });

  it('pins that are not live are visible only to their author and admins', async () => {
    const count = async (who) =>
      (await as(who, 'select id from public.pins where id = $1', [pin])).rows.length;
    assert.equal(await count(READER), 0);
    assert.equal(await count(EXPERT), 1);
    assert.equal(await count(ADMIN), 1);
    await rejects(as(null, 'select id from public.pins'), /permission denied/);
  });

  it('nobody sets a pin live by hand — not experts, not admins (publish_pin checks first)', async () => {
    await rejects(
      as(EXPERT, `update public.pins set status = 'live' where id = $1`, [pin]),
      /row-level security|publish_pin/,
    );
    await rejects(
      as(ADMIN, `update public.pins set status = 'live' where id = $1`, [pin]),
      /publish_pin/,
    );
    await rejects(as(EXPERT, 'select public.publish_pin($1)', [pin]), /Only reviewers/);
  });

  it('experts write versions and questions but cannot approve them; admins approve', async () => {
    const adult = await addVersion(EXPERT, pin, 'adult');
    await addVersion(EXPERT, pin, 'teen');
    const q = await addQuestion(EXPERT, adult);
    await rejects(
      as(EXPERT, `update public.pin_versions set status = 'approved' where id = $1`, [adult]),
      /Only reviewers/,
    );
    await rejects(
      as(EXPERT, `update public.pin_questions set status = 'approved' where id = $1`, [q]),
      /Only reviewers/,
    );
    await rejects(
      as(ADMIN, 'select public.publish_pin($1)', [pin]),
      /adult version must be approved/,
    );
    const { rows } = await as(
      ADMIN,
      `update public.pin_versions set status = 'approved' where id = $1 returning reviewed_by`,
      [adult],
    );
    assert.equal(rows[0].reviewed_by, ADMIN);
    await rejects(
      as(ADMIN, 'select public.publish_pin($1)', [pin]),
      /questions of the adult version/,
    );
    await as(ADMIN, `update public.pin_questions set status = 'approved' where id = $1`, [q]);
  });

  it('publishing labels the pin "ai_summarized" unless a verified expert approved the text', async () => {
    const first = await as(ADMIN, 'select public.publish_pin($1) as label', [pin]);
    assert.equal(first.rows[0].label, 'ai_summarized'); // the approving admin is not an expert
    // An admin who is also a verified expert approved it → expert_verified.
    await as(
      ADMIN,
      `insert into public.experts (user_id, display_name, field, verification_method, verified_by, verified_at)
       values ($1, 'Prof Chan', 'Geography', 'org_email', $1, now())`,
      [ADMIN],
    );
    const again = await as(ADMIN, 'select public.publish_pin($1) as label', [pin]);
    assert.equal(again.rows[0].label, 'expert_verified');
  });

  it('readers see live pins with only approved versions and questions, plus sources', async () => {
    // The pin is live, so its author can no longer add sources; an admin can.
    await rejects(
      as(
        EXPERT,
        `insert into public.pin_sources (pin_id, title, url, source_db)
         values ($1, 'Gwulo: Kowloon Tong', 'https://gwulo.com/', 'web')`,
        [pin],
      ),
      /row-level security/,
    );
    await as(
      ADMIN,
      `insert into public.pin_sources (pin_id, title, url, source_db)
       values ($1, 'Gwulo: Kowloon Tong', 'https://gwulo.com/', 'web')`,
      [pin],
    );
    const onMap = await as(READER, 'select id from public.pins_map where id = $1', [pin]);
    assert.equal(onMap.rows.length, 1);
    const versions = await as(
      READER,
      'select reading_level from public.pin_versions where pin_id = $1',
      [pin],
    );
    assert.deepEqual(versions.rows, [{ reading_level: 'adult' }]); // the teen version is in review
    assert.equal((await as(READER, 'select id from public.pin_questions')).rows.length, 1);
    const sources = await as(READER, 'select id from public.pin_sources where pin_id = $1', [pin]);
    assert.equal(sources.rows.length, 1);
  });

  it('authors cannot edit a live pin', async () => {
    const { rows } = await as(
      EXPERT,
      `update public.pins set title = 'Changed' where id = $1 returning id`,
      [pin],
    );
    assert.equal(rows.length, 0);
  });

  it('editing a version sends it, its questions and the live pin back to review', async () => {
    await as(
      ADMIN,
      `update public.pin_versions set body = 'A corrected adult reading version.'
       where pin_id = $1 and reading_level = 'adult'`,
      [pin],
    );
    const { rows } = await db.query(
      `select v.status as version, q.status as question, p.status as pin
       from public.pin_versions v join public.pin_questions q on q.pin_version_id = v.id
       join public.pins p on p.id = v.pin_id where v.pin_id = $1 and v.reading_level = 'adult'`,
      [pin],
    );
    assert.deepEqual(rows, [{ version: 'in_review', question: 'in_review', pin: 'in_review' }]);
    const seen = await as(READER, 'select id from public.pins where id = $1', [pin]);
    assert.equal(seen.rows.length, 0);
    // Approve and publish again for the tests below.
    await as(ADMIN, `update public.pin_versions set status = 'approved' where pin_id = $1`, [pin]);
    await as(ADMIN, `update public.pin_questions set status = 'approved'`);
    await as(ADMIN, 'select public.publish_pin($1)', [pin]);
  });

  it('adults collect live pins as themselves; nobody else reads their collection', async () => {
    await as(READER, 'insert into public.collection_entries (pin_id) values ($1)', [pin]);
    assert.equal((await as(READER, 'select pin_id from public.collection_entries')).rows.length, 1);
    assert.equal((await as(EXPERT, 'select pin_id from public.collection_entries')).rows.length, 0);
    // read_at is set by the server (phase 5), never by the client.
    await rejects(
      as(READER, 'update public.collection_entries set read_at = now() where pin_id = $1', [pin]),
      /permission denied/,
    );
    const draft = await newPin('A pin still in review');
    await rejects(
      as(READER, 'insert into public.collection_entries (pin_id) values ($1)', [draft]),
      /row-level security/,
    );
  });

  it('under-18s (and users without settings) never store a collection on the server', async () => {
    for (const who of [KID, NEWBIE]) {
      await rejects(
        as(who, 'insert into public.collection_entries (pin_id) values ($1)', [pin]),
        /row-level security/,
      );
    }
    // Only an anonymous count per pin and day.
    await as(KID, 'select public.record_pin_unlock($1)', [pin]);
    const { rows } = await db.query('select * from public.pin_unlock_counts where pin_id = $1', [
      pin,
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['pin_id', 'unlocked_on', 'unlocks']);
    await rejects(as(KID, 'select * from public.pin_unlock_counts'), /permission denied/);
  });

  it('points: clients cannot add points; the ledger is append-only, even for the server', async () => {
    await rejects(
      as(
        READER,
        `insert into public.points_ledger (user_id, source, amount, ref_id)
         values ($1, 'pin_read', 999, 'x')`,
        [READER],
      ),
      /permission denied/,
    );
    const award = () =>
      db.query(
        `insert into public.points_ledger (user_id, source, amount, ref_id)
         values ($1, 'pin_read', 20, $2)`,
        [READER, pin],
      );
    await award();
    assert.equal((await as(READER, 'select amount from public.points_ledger')).rows.length, 1);
    assert.equal((await as(EXPERT, 'select amount from public.points_ledger')).rows.length, 0);
    await rejects(db.query('update public.points_ledger set amount = 1000'), /append-only/);
    await rejects(db.query('delete from public.points_ledger'), /append-only/);
    await rejects(award(), /duplicate key/); // one award per user, source and thing
  });

  it('settings: safety mode follows the age band and cannot be switched off', async () => {
    const kid = await as(KID, 'select safety_mode, reading_style from public.user_settings');
    assert.deepEqual(kid.rows, [{ safety_mode: true, reading_style: 'adult' }]);
    // A child may pick any reading style; safety mode stays on.
    await as(KID, `update public.user_settings set reading_style = 'adult'`);
    await rejects(
      as(KID, `update public.user_settings set age_band = 'adult'`),
      /can't be turned off/,
    );
    await rejects(
      as(KID, 'update public.user_settings set safety_mode = false'),
      /permission denied|can only be updated to DEFAULT/,
    );
    await rejects(as(KID, 'delete from public.user_settings'), /permission denied/);
    const after = await as(KID, 'select safety_mode from public.user_settings');
    assert.deepEqual(after.rows, [{ safety_mode: true }]);
    // Users only see their own settings.
    const mine = await as(READER, 'select user_id from public.user_settings');
    assert.deepEqual(mine.rows, [{ user_id: READER }]);
  });
});

describe('safety mode for under-18s (pins phase 2, D52)', () => {
  const TEEN = 'd0000000-0000-4000-8000-000000000001';
  const GROWNUP = 'd0000000-0000-4000-8000-000000000002'; // adult who later says they're under 18
  const TEEN_ROUTE = 'd0000000-0000-4000-8000-0000000000aa';
  const GROWNUP_ROUTE = 'd0000000-0000-4000-8000-0000000000bb';

  before(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2)', [TEEN, GROWNUP]);
    await as(
      TEEN,
      `insert into public.user_settings (age_band, consent_version) values ('under_18', 'v1')`,
    );
    await as(
      GROWNUP,
      `insert into public.user_settings (age_band, consent_version) values ('adult', 'v1')`,
    );
  });

  it('under-18s cannot upload a route recording', async () => {
    await rejects(
      as(TEEN, 'select public.create_route($1::jsonb)', [
        JSON.stringify(payload({ id: TEEN_ROUTE })),
      ]),
      /not available in safety mode/,
    );
  });

  it('under-18s cannot get a friend code, so nobody can add them', async () => {
    await rejects(as(TEEN, 'select public.my_friend_code()'), /not available in safety mode/);
  });

  it('under-18s cannot share their location', async () => {
    await rejects(
      as(TEEN, `select public.start_location_share(22.3365, 114.1745, 8, 'exact', true, 60, '{}')`),
      /not available in safety mode/,
    );
  });

  it('switching to under-18 removes recordings, friend codes and shares already on the server', async () => {
    await as(GROWNUP, 'select public.create_route($1::jsonb)', [
      JSON.stringify(payload({ id: GROWNUP_ROUTE })),
    ]);
    await as(GROWNUP, 'select public.my_friend_code()');
    await as(
      GROWNUP,
      `select public.start_location_share(22.3365, 114.1745, 8, 'exact', true, 60, '{}')`,
    );
    await as(GROWNUP, `update public.user_settings set age_band = 'under_18'`);
    const left = await db.query(
      `select
         (select count(*) from public.routes where created_by = $1)::int as routes,
         (select count(*) from public.friend_codes where user_id = $1)::int as codes,
         (select count(*) from public.location_shares where user_id = $1)::int as shares`,
      [GROWNUP],
    );
    assert.deepEqual(left.rows[0], { routes: 0, codes: 0, shares: 0 });
    // …and there is no way back to adult (phase 1 test), so nothing can be re-created.
    await rejects(as(GROWNUP, 'select public.my_friend_code()'), /not available in safety mode/);
  });

  it('adults and accounts that have not answered yet keep every feature', async () => {
    // ALICE and BOB (earlier tests) have no settings row and created routes and friend codes above.
    const { rows } = await db.query('select count(*)::int as n from public.friend_codes');
    assert.ok(rows[0].n >= 2);
  });
});

describe('pin authoring helpers (pins phase 3, D53)', () => {
  const ADMIN = 'c0000000-0000-4000-8000-000000000001'; // from the phase 1 tests
  const EXPERT = 'c0000000-0000-4000-8000-000000000002';
  const READER = 'c0000000-0000-4000-8000-000000000003';

  it('my_pin_role says admin, expert or nothing', async () => {
    const role = async (who) => (await as(who, 'select public.my_pin_role() as r')).rows[0].r;
    assert.equal(await role(ADMIN), 'admin');
    assert.equal(await role(EXPERT), 'expert');
    assert.equal(await role(READER), null);
  });

  it('nearest_ped_node finds a node of the active graph within 25 m, and nothing farther away', async () => {
    const { rows } = await db.query(
      `select n.id, extensions.st_y(n.geom) as lat, extensions.st_x(n.geom) as lng
       from public.ped_nodes n join public.graph_builds b on b.id = n.build_id
       where b.status = 'active' limit 1`,
    );
    const node = rows[0];
    // ~10 m north of the node → snaps to it.
    const near = await as(
      READER,
      'select node_id, distance_m from public.nearest_ped_node($1, $2)',
      [node.lat + 0.00009, node.lng],
    );
    assert.equal(near.rows.length, 1);
    assert.ok(near.rows[0].distance_m < 25);
    // Far from any node (Tsim Sha Tsui) → nothing.
    const far = await as(READER, 'select node_id from public.nearest_ped_node(22.2976, 114.1722)');
    assert.equal(far.rows.length, 0);
  });

  it('experts can write the summary of their own pin', async () => {
    const { rows } = await as(
      EXPERT,
      `insert into public.pins (title, summary, location, place_kind, place_description, author_expert_id)
       values ('Summary test', 'A short summary written by the expert from the sources.',
               extensions.st_setsrid(extensions.st_makepoint(114.1745, 22.3372), 4326),
               'custom', 'A test place by the road', $1)
       returning summary`,
      [EXPERT],
    );
    assert.match(rows[0].summary, /short summary/);
  });
});

describe('sample pin seed (supabase/seed/sample_pin.sql)', () => {
  const EXPERT = 'c0000000-0000-4000-8000-000000000002'; // from the phase 1 tests

  it('creates the sample pin in review, marked as sample, with its two sources', async () => {
    const sql = fs
      .readFileSync(path.join(here, '..', 'seed', 'sample_pin.sql'), 'utf8')
      .replace('00000000-0000-0000-0000-000000000000', EXPERT);
    await db.exec(sql);
    const { rows } = await db.query(
      `select p.status, p.is_sample, count(s.id)::int as sources
       from public.pins p join public.pin_sources s on s.pin_id = p.id
       where p.title = 'Why Kent Road is in Kowloon' and p.is_sample group by p.id`,
    );
    assert.deepEqual(rows, [{ status: 'in_review', is_sample: true, sources: 2 }]);
  });
});

describe('deleting your pin collection (pins phase 4, D54)', () => {
  const EXPERT = 'c0000000-0000-4000-8000-000000000002';
  const READER = 'c0000000-0000-4000-8000-000000000003';

  it('users delete only their own collection entries', async () => {
    const before = await db.query('select count(*)::int as n from public.collection_entries');
    assert.ok(before.rows[0].n >= 1); // READER collected a pin in the phase 1 tests
    const theirs = await as(EXPERT, 'delete from public.collection_entries returning pin_id');
    assert.equal(theirs.rows.length, 0); // EXPERT can't touch READER's entries
    const mine = await as(READER, 'delete from public.collection_entries returning pin_id');
    assert.equal(mine.rows.length, before.rows[0].n);
  });
});
