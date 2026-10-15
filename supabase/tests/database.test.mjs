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
    assert.match(p.name, /^Walker [A-HJ-NP-Z2-9]{4}$/); // no display name set → code-based name
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
