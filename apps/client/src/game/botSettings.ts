/**
 * The options for a game against bots, remembered on this device between visits:
 * 12-13-1 on or off, and how many seconds each bot takes over its turn.
 */
export type BotSettings = { aceHigh: boolean; seconds: number };

export const MIN_BOT_SECONDS = 1;
export const MAX_BOT_SECONDS = 10;
export const DEFAULT_BOT_SETTINGS: BotSettings = { aceHigh: true, seconds: 5 };
const KEY = 'gur.bots';

/** A whole number of seconds from 1 to 10, whatever came in. */
export function botSeconds(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_BOT_SETTINGS.seconds;
  return Math.min(MAX_BOT_SECONDS, Math.max(MIN_BOT_SECONDS, n));
}

export function loadBotSettings(): BotSettings {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<BotSettings> | null;
    if (!saved || typeof saved !== 'object') return DEFAULT_BOT_SETTINGS;
    return {
      aceHigh: typeof saved.aceHigh === 'boolean' ? saved.aceHigh : DEFAULT_BOT_SETTINGS.aceHigh,
      seconds: saved.seconds === undefined ? DEFAULT_BOT_SETTINGS.seconds : botSeconds(saved.seconds),
    };
  } catch {
    // Storage can be blocked (private browsing): the defaults do.
    return DEFAULT_BOT_SETTINGS;
  }
}

export function saveBotSettings(settings: BotSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered this time.
  }
}

/** The address of a game against bots with these options. */
export function playAddress({ aceHigh, seconds }: BotSettings): string {
  return `/play?aceHigh=${aceHigh ? 1 : 0}&seconds=${botSeconds(seconds)}`;
}
