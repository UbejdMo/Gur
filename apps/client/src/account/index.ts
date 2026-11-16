import { useSyncExternalStore } from 'react';
import { Account } from './account';
import type { AccountSnapshot } from './account';
import { accountsConfig } from './config';
import { supabaseBackend } from './supabaseBackend';

const config = accountsConfig();

/** The app's one account. */
export const account = new Account(config ? supabaseBackend(config.url, config.key) : null);

/** Your account as it is right now. */
export function useAccount(): AccountSnapshot {
  return useSyncExternalStore(account.subscribe, account.get, account.get);
}
