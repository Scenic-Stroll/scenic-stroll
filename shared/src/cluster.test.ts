import { describe, expect, it } from 'vitest';

import { clusterMarkers, CLUSTER_MAX_ZOOM, zoomFromLongitudeDelta } from './cluster.ts';

const pins = [
  { id: 'a', lat: 22.3372, lng: 114.1745 },
  { id: 'b', lat: 22.3374, lng: 114.1747 }, // ~30 m from a
  { id: 'c', lat: 22.2976, lng: 114.1722 }, // Tsim Sha Tsui, ~4.4 km away
];

describe('clusterMarkers', () => {
  it('groups nearby pins when zoomed out, keeps far ones apart', () => {
    const out = clusterMarkers(pins, 13);
    const cluster = out.find((c) => c.kind === 'cluster');
    expect(
      cluster && cluster.kind === 'cluster' ? cluster.items.map((i) => i.id).sort() : [],
    ).toEqual(['a', 'b']);
    expect(
      out.filter((c) => c.kind === 'single').map((c) => (c.kind === 'single' ? c.item.id : '')),
    ).toEqual(['c']);
  });

  it('shows every pin on its own at street level', () => {
    expect(clusterMarkers(pins, CLUSTER_MAX_ZOOM).every((c) => c.kind === 'single')).toBe(true);
  });

  it('works out the zoom from the visible width', () => {
    expect(Math.round(zoomFromLongitudeDelta(360 / 2 ** 15))).toBe(15);
  });
});
