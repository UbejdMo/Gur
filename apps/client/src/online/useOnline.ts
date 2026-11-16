import { useSyncExternalStore } from 'react';
import { online } from './connection';
import type { OnlineSnapshot } from './connection';

/** The connection to the game server, as it is right now. */
export function useOnline(): OnlineSnapshot {
  return useSyncExternalStore(online.subscribe, online.get, online.get);
}
