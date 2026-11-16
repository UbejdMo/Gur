import { useEffect, useSyncExternalStore } from 'react';
import { Account } from './account';
import type { AccountSnapshot } from './account';
import { accountsConfig } from './config';
import { Friends } from './friends';
import type { FriendsSnapshot } from './friends';
import { supabaseBackend } from './supabaseBackend';

const config = accountsConfig();
const backend = config ? supabaseBackend(config.url, config.key) : null;

/** The app's one account. */
export const account = new Account(backend);

/** The signed-in player's friends and requests. */
export const friends = new Friends(backend?.friends ?? null);

/** Your account as it is right now. */
export function useAccount(): AccountSnapshot {
  return useSyncExternalStore(account.subscribe, account.get, account.get);
}

/** How often a screen that shows friends looks for news (a request, an answer). */
const LOOK_EVERY_MS = 30_000;

/**
 * Your friends and requests as they are right now. While a screen uses this and you are
 * signed in, the list is fetched, and fetched again every half minute as long as the game
 * is in front of you. Signed out, it is empty.
 */
export function useFriends(): FriendsSnapshot {
  const { status } = useAccount();
  useEffect(() => {
    if (status !== 'signedIn') {
      friends.clear();
      return;
    }
    void friends.refresh();
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void friends.refresh();
    }, LOOK_EVERY_MS);
    return () => clearInterval(timer);
  }, [status]);
  return useSyncExternalStore(friends.subscribe, friends.get, friends.get);
}
