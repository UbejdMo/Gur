import { getTile } from '@gur/engine';
import type { TileId } from '@gur/engine';
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { en } from './en';
import type { Strings } from './en';
import { sq } from './sq';

/**
 * The app's languages: English and Albanian. The app follows the phone's (or browser's) first
 * language until the player picks one with the switch in the top bar; that choice is remembered
 * on the device. Every text a player sees comes from `en.ts` / `sq.ts`, never from a string in a
 * component: `const t = useT();` then `t.home.playBots`.
 */
export type Language = 'en' | 'sq';
export type { Strings };

export const DICTIONARIES: Record<Language, Strings> = { en, sq };
const KEY = 'gur.language';

function deviceLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === 'sq' ? 'sq' : 'en';
  } catch {
    return 'en';
  }
}

function savedLanguage(): Language | null {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return saved === 'en' || saved === 'sq' ? saved : null;
  } catch {
    return null;
  }
}

let current: Language = savedLanguage() ?? deviceLanguage();
const listeners = new Set<() => void>();

/** Tells the browser (screen readers, translation offers) which language the page is in. */
function markPage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
markPage();

/** The language the app shows now. */
export function language(): Language {
  return current;
}

/** Switches the whole app to another language and remembers the choice on this device. */
export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // Not remembered this time (storage blocked): it still applies until the app closes.
  }
  markPage();
  for (const listener of listeners) listener();
}

/** Forgets the player's choice: back to the device's language (tests, mostly). */
export function resetLanguage(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // nothing remembered
  }
  current = deviceLanguage();
  markPage();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The texts in the current language, for code outside components (it does not update by itself). */
export function strings(): Strings {
  return DICTIONARIES[current];
}

/** The current language; the component draws again when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, language, language);
}

/** The texts in the current language; the component draws again when the language changes. */
export function useT(): Strings {
  return DICTIONARIES[useLanguage()];
}

/**
 * A refusal from the game server or the rules engine, which are written in English, in the
 * current language. A message the dictionary does not know is shown as it came.
 */
export function translateRefusal(message: string): string {
  const t = strings();
  if (current === 'en') return message;
  const known = t.refusals[message];
  if (known) return known;
  const long = /^Keep it under (\d+) characters$/.exec(message);
  if (long) return t.chat.tooLong(Number(long[1]));
  const hand = /^Each hand must have (\d+) tiles$/.exec(message);
  if (hand) return t.refusalHandSize(Number(hand[1]));
  return message;
}

/** A tile's name for players and screen readers, e.g. "red 7" or "7 i kuq". */
export function tileName(id: TileId, t: Strings = strings()): string {
  const tile = getTile(id);
  return tile.printedJoker || tile.color === null || tile.number === null
    ? t.tiles.printedJoker
    : t.tiles.named(tile.color, tile.number);
}
