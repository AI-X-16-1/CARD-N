/**
 * This install's id — the value every API request carries as `X-Device-Id`.
 *
 * CARD:N has no accounts, but the backend still has to know whose contacts are whose
 * (backend/app/device.py). This is that "whose": a random id generated on first launch and
 * kept from then on.
 *
 * It is **isolation, not authentication**. Anyone can send someone else's id; what this
 * buys is that two people using the app normally never land in the same data. Do not start
 * treating it as proof of identity.
 *
 * It does not survive a reinstall, and it is not shared between a user's devices — losing
 * it means the app looks empty, not that the data is gone. Real accounts are what fixes
 * both, and when they arrive only this module changes.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY = 'cardn.deviceId';

// Resolved once per process. The API client awaits this on every request, so it must not
// hit storage each time.
let pending: Promise<string> | null = null;

function randomId(): string {
  // Expo's runtime provides crypto.randomUUID on SDK 51+; the branches below are for a
  // web preview or a stripped runtime where it is missing. The last one is weak, but this
  // value is a namespace, not a secret — see the note at the top.
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * SecureStore is not available on web, where the app runs as a react-native-web preview.
 * localStorage is the honest equivalent there: same lifetime, same "cleared with site
 * data" caveat.
 */
async function read(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(STORAGE_KEY);
}

async function write(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, id);
    } catch {
      // A private window with storage blocked. The id stays in memory for this session,
      // which is enough to keep the app working until it is closed.
    }
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, id);
}

export async function getDeviceId(): Promise<string> {
  if (pending) return pending;

  pending = (async () => {
    const stored = await read();
    if (stored) return stored;

    const created = randomId();
    await write(created);
    return created;
  })();

  // A failed read must not poison the process — drop the memo so the next request retries
  // rather than every call inheriting the same rejection.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}

/** Test seam: forget the resolved id so the next call re-reads storage. */
export function resetDeviceIdForTests(): void {
  pending = null;
}
