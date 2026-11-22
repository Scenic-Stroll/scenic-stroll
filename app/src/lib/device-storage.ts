// Key-value storage on the device for small app state (the pin collection, D54).
// Phones: AsyncStorage. The web version (device-storage.web.ts) uses IndexedDB.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

export const deviceStorage: StateStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
