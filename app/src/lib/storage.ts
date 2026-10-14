import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

/** SecureStore with a memory fallback so the app still runs where the keychain is unavailable. */
const memory = new Map<string, string>();

// On web there is no keychain. sessionStorage is per tab, so each tab behaves like its own phone.
const web = () => (Platform.OS === 'web' ? globalThis.sessionStorage : undefined);

export async function getItem(key: string): Promise<string | null> {
  try {
    if (web()) return web()!.getItem(key);
    return (await SecureStore.getItemAsync(key)) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (web()) { if (value === null) web()!.removeItem(key); else web()!.setItem(key, value); return; }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* memory copy already holds it */
  }
}

export async function getDeviceId(): Promise<string> {
  const existing = await getItem('pp_device_id');
  if (existing) return existing;
  const id = randomUUID();
  await setItem('pp_device_id', id);
  return id;
}
