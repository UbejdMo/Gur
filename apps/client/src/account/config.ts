import { Platform } from 'react-native';

/**
 * The Supabase project that holds the accounts. Both values are public by design (the
 * "publishable" key only allows what the database's own rules allow), so they can sit here
 * in the open. A build can point at another project with EXPO_PUBLIC_SUPABASE_URL and
 * EXPO_PUBLIC_SUPABASE_KEY.
 *
 * While they are empty the app has no accounts: everybody plays as a guest. The browser tests
 * set `__GUR_ACCOUNTS__` on the page before the app loads, to use the stand-in they started.
 */
export const DEFAULT_SUPABASE_URL = '';
export const DEFAULT_SUPABASE_KEY = '';

export function accountsConfig(): { url: string; key: string } | null {
  // Signing in is built for the web so far; the phone apps get it with their store builds.
  if (Platform.OS !== 'web') return null;
  const override = (globalThis as { __GUR_ACCOUNTS__?: { url?: unknown; key?: unknown } }).__GUR_ACCOUNTS__;
  if (override && typeof override.url === 'string' && typeof override.key === 'string') {
    return { url: override.url, key: override.key };
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || DEFAULT_SUPABASE_KEY;
  return url && key ? { url, key } : null;
}
