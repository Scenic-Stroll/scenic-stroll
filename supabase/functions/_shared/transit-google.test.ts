// Deno test for the Google transit parser (no network, no key): a response shaped like Google's
// documentation — walk → MTR → walk, with a fare. Run: npm run test:functions
import { assertEquals } from 'jsr:@std/assert@1';

import { parseGoogleTransit } from './transit-google.ts';

// Two-point encoded polylines (precision 5) near Kowloon Tong.
const LINE = '_ibE_seK_seK_seK';
const departAt = new Date('2026-10-19T08:30:00+08:00');

const sample = {
  routes: [
    {
      legs: [
        {
          steps: [
            {
              travelMode: 'WALK',
              staticDuration: '120s',
              distanceMeters: 150,
              polyline: { encodedPolyline: LINE },
            },
            {
              travelMode: 'WALK',
              staticDuration: '60s',
              distanceMeters: 70,
              polyline: { encodedPolyline: LINE },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '600s',
              distanceMeters: 7600,
              polyline: { encodedPolyline: LINE },
              transitDetails: {
                stopDetails: {
                  departureStop: { name: 'Kowloon Tong' },
                  arrivalStop: { name: 'Admiralty' },
                  // Leaves 4 min after we reach the platform (3 min of walking first).
                  departureTime: '2026-10-19T00:37:00Z',
                  arrivalTime: '2026-10-19T00:47:00Z',
                },
                headsign: 'Admiralty',
                stopCount: 4,
                transitLine: {
                  name: 'East Rail Line',
                  nameShort: 'EAL',
                  color: '#5eb6e4',
                  agencies: [{ name: 'MTR' }],
                  vehicle: { type: 'HEAVY_RAIL', name: { text: 'Train' } },
                },
              },
            },
            {
              travelMode: 'WALK',
              staticDuration: '300s',
              distanceMeters: 350,
              polyline: { encodedPolyline: LINE },
            },
          ],
        },
      ],
      travelAdvisory: { transitFare: { currencyCode: 'HKD', units: '13', nanos: 200000000 } },
    },
  ],
};

Deno.test('Google transit: walks merged, ride with wait, line colour and fare', () => {
  const [plan] = parseGoogleTransit(sample, departAt);
  assertEquals(plan!.source, 'google');
  assertEquals(plan!.fare_hkd, 13.2);
  assertEquals(
    plan!.legs.map((l) => l.kind),
    ['walk', 'ride', 'walk'],
  );
  const walk = plan!.legs[0]!;
  assertEquals(walk.duration_s, 180);
  const ride = plan!.legs[1]!;
  if (ride.kind !== 'ride') throw new Error('expected a ride');
  assertEquals(ride.vehicle, 'rail');
  assertEquals(ride.line, 'EAL');
  assertEquals(ride.operator, 'MTR');
  assertEquals(ride.wait_s, 240);
  assertEquals(ride.duration_s, 600);
  assertEquals(
    ride.instruction,
    'Take train EAL towards Admiralty · 4 stops · get off at Admiralty',
  );
  // Matched to our MTR data, so plan-trip can fetch the live next train at Kowloon Tong.
  assertEquals(ride.boarding?.stop_id, 'mtr:KOT');
  assertEquals(ride.boarding?.route, 'EAL');
  assertEquals(ride.boarding?.dest_codes?.includes('ADM'), true);
  assertEquals(ride.boarding?.dest_codes?.includes('LOW'), false);
});

Deno.test('Google transit: a route without any ride is ignored', () => {
  const walkOnly = { routes: [{ legs: [{ steps: [sample.routes[0]!.legs[0]!.steps[0]] }] }] };
  assertEquals(parseGoogleTransit(walkOnly, departAt), []);
});
