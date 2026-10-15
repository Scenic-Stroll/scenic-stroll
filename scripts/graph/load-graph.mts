// Step 3 of building our walking graph: upload scripts/graph/data/graph.json to Supabase and make it
// the active graph. The old graph keeps serving routes until the very last step.
// Run: GRAPH_LOADER_KEY=<key from npm run graph:key> npm run graph:load
//
// Only the main connected piece is uploaded: nodes in small disconnected scraps can't be routed
// to anyway (see the build report).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GraphEdge, GraphNode } from '../../shared/src/graph-build.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const env = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8');
const read = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const url = read('EXPO_PUBLIC_SUPABASE_URL');
const publishableKey = read('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const loaderKey = process.env.GRAPH_LOADER_KEY;
if (!url || !publishableKey)
  throw new Error('app/.env is missing the Supabase URL or publishable key');
if (!loaderKey) throw new Error('Set GRAPH_LOADER_KEY (get one with: npm run graph:key)');

const graph = JSON.parse(fs.readFileSync(path.join(here, 'data', 'graph.json'), 'utf8')) as {
  source: string;
  sourceVersion: string;
  bbox: Record<string, number>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  report: Record<string, unknown>;
};

// Main piece only.
const nodes = graph.nodes.filter((n) => n.component === 0);
const keep = new Set(nodes.map((n) => n.id));
const edges = graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));

// 7 decimals ≈ 1 cm: plenty, and it halves the upload.
const r7 = (v: number) => Math.round(v * 1e7) / 1e7;
const r2 = (v: number) => Math.round(v * 100) / 100;

// Sign in anonymously (the loader functions are for signed-in callers; the key is the real check).
const signup = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
  body: '{}',
});
const session = (await signup.json()) as { access_token?: string };
if (!session.access_token) throw new Error(`Anonymous sign-in failed (HTTP ${signup.status})`);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey!,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(`${fn} failed (HTTP ${res.status}): ${body.message ?? JSON.stringify(body)}`);
  return body as T;
}

const buildId = await rpc<number>('graph_begin', {
  p_key: loaderKey,
  p_source: graph.source,
  p_source_version: graph.sourceVersion,
  p_bbox: graph.bbox,
});
console.log(`Build ${buildId}: uploading ${nodes.length} nodes and ${edges.length} edges…`);

const BATCH = 1500;
for (let i = 0; i < nodes.length; i += BATCH) {
  const batch = nodes.slice(i, i + BATCH).map((n) => ({
    id: n.id,
    lng: r7(n.lng),
    lat: r7(n.lat),
    z: r2(n.z),
    level: null,
    kind: n.kind,
    is_entrance: n.is_entrance,
  }));
  await rpc('graph_add', { p_key: loaderKey, p_build_id: buildId, p_nodes: batch, p_edges: [] });
  console.log(`  nodes ${Math.min(i + BATCH, nodes.length)}/${nodes.length}`);
}
for (let i = 0; i < edges.length; i += BATCH) {
  const batch = edges.slice(i, i + BATCH).map((e) => ({
    ...e,
    coords: e.coords.map(([lng, lat]) => [r7(lng), r7(lat)]),
    z_from: r2(e.z_from),
    z_to: r2(e.z_to),
    tree_cover_pct: null,
    data_source: graph.source,
  }));
  await rpc('graph_add', { p_key: loaderKey, p_build_id: buildId, p_nodes: [], p_edges: batch });
  console.log(`  edges ${Math.min(i + BATCH, edges.length)}/${edges.length}`);
}

const result = await rpc<Record<string, number>>('graph_activate', {
  p_key: loaderKey,
  p_build_id: buildId,
  p_report: {
    ...graph.report,
    uploadedNodes: nodes.length,
    uploadedEdges: edges.length,
    droppedScrapNodes: graph.nodes.length - nodes.length,
  },
});
console.log(
  `✓ Build ${result.build_id} is now the active walking graph (${result.nodes} nodes, ${result.edges} edges)`,
);
