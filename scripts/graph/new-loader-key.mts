// Makes a one-day key for uploading a walking graph (npm run graph:load).
// Run: npm run graph:key
//
// Prints the key (keep it on your laptop) and one SQL line to run in the Supabase dashboard
// (SQL editor) that registers the key's HASH. The key itself never goes to the server's storage,
// and it stops working after 24 hours.
import { createHash, randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(key, 'utf8').digest('hex');

console.log('1. Run this in Supabase → SQL editor:\n');
console.log(
  `insert into private.graph_loader_keys (key_hash, expires_at) values (decode('${hash}', 'hex'), now() + interval '1 day');\n`,
);
console.log('2. Then load the graph with this key (bash):\n');
console.log(`GRAPH_LOADER_KEY=${key} npm run graph:load\n`);
