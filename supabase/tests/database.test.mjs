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
    assert.equal(out.edges[0].length, 23, 'edge tuple has 23 fields (22 = shade)');
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
    assert.equal(edge.length, 23, 'shade is field 22');
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
