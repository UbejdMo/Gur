/**
 * The 12-13-1 choice for Play online, remembered on this device. Players are only matched with
 * players who made the same choice.
 */
const KEY = 'gur.online';

export function loadOnlineAceHigh(): boolean {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as { aceHigh?: unknown } | null;
    return typeof saved?.aceHigh === 'boolean' ? saved.aceHigh : true;
  } catch {
    // Storage can be blocked (private browsing): allowed, like everywhere else.
    return true;
  }
}

export function saveOnlineAceHigh(aceHigh: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ aceHigh }));
  } catch {
    // Not remembered this time.
  }
}
