// The walking graph from the local files (scripts/graph/data/graph.json + shade.json if computed),
// prepared exactly as the server prepares it. Used by graph:try and eval:routing, so both test the
// same graph the app uses — without deploying anything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GraphEdge, GraphNode } from '../../shared/src/graph-build.ts';
import { prepareGraph, type PreparedGraph } from '../../shared/src/router.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export type LocalGraph = { graph: PreparedGraph; sourceVersion: string; shadeDate: string | null };

export function loadLocalGraph(): LocalGraph {
  const graphPath = path.join(here, 'data', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    throw new Error(
      'No scripts/graph/data/graph.json — run npm run graph:download && npm run graph:build',
    );
  }
  const raw = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as {
    source: string;
    sourceVersion: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  // Shade, if computed (npm run graph:shade).
  const shadePath = path.join(here, 'data', 'shade.json');
  const shade = fs.existsSync(shadePath)
    ? (JSON.parse(fs.readFileSync(shadePath, 'utf8')) as {
        date: string;
        firstMin: number;
        bucketMin: number;
        edges: [number, number[], number][];
      })
    : null;
  const shadeById = new Map(shade?.edges.map(([id, pct]) => [id, pct]) ?? []);

  // Same as what the server loads: the main connected piece, with the build script's ids (they
  // have gaps where scraps were left out; prepareGraph renumbers them, exactly as on the server).
  const nodes = raw.nodes.filter((n) => n.component === 0);
  const graph = prepareGraph({
    buildId: 0,
    source: raw.source,
    version: raw.sourceVersion,
    shadeMeta: shade
      ? { date: shade.date, firstMin: shade.firstMin, bucketMin: shade.bucketMin }
      : null,
    nodes: nodes.map((n) => ({ id: n.id, lng: n.lng, lat: n.lat, z: n.z, kind: n.kind })),
    edges: raw.edges.map((e) => ({
      ...e,
      data_source: raw.source,
      shade: shadeById.get(e.id) ?? null,
      line: e.coords.map(([lng, lat]) => ({ lng, lat })),
    })),
  });
  return { graph, sourceVersion: raw.sourceVersion, shadeDate: shade?.date ?? null };
}
