import type { FirebaseApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';

// Firebase keys contain ':'; SecureStore accepts only alphanumeric characters, '.', '-' and '_'.
const storageKey = (key: string) => `wl.${Array.from(key).map((c) => c.charCodeAt(0).toString(16)).join('.')}`;
export function initializeSessionAuth(app: FirebaseApp) {
  return initializeAuth(app, { persistence: getReactNativePersistence({
    getItem: (key: string) => SecureStore.getItemAsync(storageKey(key)),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(storageKey(key), value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(storageKey(key)),
  }) });
}
