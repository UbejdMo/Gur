/** The game server used when nothing else is set: the one that runs for the public web game. */
export const DEFAULT_SERVER = 'https://gur-server.onrender.com';

/**
 * Where the game server is. A build can point somewhere else with EXPO_PUBLIC_SERVER_URL
 * (a server on your own computer is http://localhost:3001). The browser tests set
 * `__GUR_SERVER__` on the page before the app loads, to use the server they started.
 */
export function serverUrl(): string {
  const override = (globalThis as { __GUR_SERVER__?: unknown }).__GUR_SERVER__;
  if (typeof override === 'string' && override) return override;
  return process.env.EXPO_PUBLIC_SERVER_URL || DEFAULT_SERVER;
}
