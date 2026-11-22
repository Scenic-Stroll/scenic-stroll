// Browser version of device-storage.ts: IndexedDB (via idb-keyval), the same database as the
// offline recordings (local-db.web.ts). Survives reloads; cleared with the site's data.
import { createStore, del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

const store = createStore('scenic-stroll-state', 'kv');

export const deviceStorage: StateStorage = {
  getItem: async (key) => (await get<string>(key, store)) ?? null,
  setItem: (key, value) => set(key, value, store),
  removeItem: (key) => del(key, store),
};
