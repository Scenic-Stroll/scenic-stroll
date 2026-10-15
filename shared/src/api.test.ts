import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FUNCTIONS } from './api.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('FUNCTIONS', () => {
  const names = Object.values(FUNCTIONS);

  it.each(names)('"%s" has a folder with index.ts and deno.json', (name) => {
    expect(fs.existsSync(path.join(root, 'supabase', 'functions', name, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'supabase', 'functions', name, 'deno.json'))).toBe(true);
  });

  it.each(names)('"%s" has a [functions.%s] block in config.toml', (name) => {
    const toml = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
    expect(toml).toContain(`[functions.${name}]`);
  });
});
