import { fireEvent, render, screen } from '@testing-library/react-native';
import { createGameWithDeal, discard, draw, playerView, timeoutMove, tileId } from '@gur/engine';
import type { Deal } from '@gur/engine';
import Home from '@/app/index';
import { describeChange } from '@/online/onlineTable';
import { DICTIONARIES, language, resetLanguage, setLanguage, strings, tileName, translateRefusal } from '@/i18n';
import { usernameProblem } from '@/account/account';
import { addMessage } from '@/account/friends';
import { when } from '@/account/messages';
import { FILLER, NEEDS_K13, NORMAL, t, ts } from '../test-utils/deal';

// The test reads the game server's and the engine's source (Jest runs in Node; the app's types don't know it).
declare const __dirname: string;
declare function require(module: 'node:fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
};
const { readFileSync, readdirSync } = require('node:fs');
const join = (...parts: string[]) => parts.join('/');

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]) }));
const getLocales = (jest.requireMock('expo-localization') as { getLocales: jest.Mock }).getLocales;

beforeEach(() => {
  localStorage.clear();
  getLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
  resetLanguage();
});
afterAll(() => resetLanguage());

/** Every key of a dictionary, as paths like "home.bots". */
function keysOf(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) && prefix !== 'refusals.' && key !== 'refusals'
      ? keysOf(v as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('the two dictionaries', () => {
  it('have the same texts: nothing is missing in Albanian or in English', () => {
    expect(keysOf(DICTIONARIES.sq).sort()).toEqual(keysOf(DICTIONARIES.en).sort());
  });

  it('fill in names and numbers in both languages', () => {
    for (const lang of ['en', 'sq'] as const) {
      const d = DICTIONARIES[lang];
      expect(d.table.playing('Ana')).toContain('Ana');
      expect(d.common.seconds(5)).toContain('5');
      expect(d.lobby.startsIn(12)).toContain('12');
      expect(d.results.matchShared(['Ana', 'Ben'])).toMatch(/Ana.*Ben/);
    }
    // Albanian counts like Albanian: 1 sekondë, 2 sekonda; 1 raund, 3 raunde
    expect(DICTIONARIES.sq.common.seconds(1)).toBe('1 sekondë');
    expect(DICTIONARIES.sq.common.seconds(2)).toBe('2 sekonda');
    expect(DICTIONARIES.sq.lobby.roundsCount(1)).toBe('1 raund');
    expect(DICTIONARIES.sq.lobby.roundsCount(3)).toBe('3 raunde');
    expect(DICTIONARIES.en.common.seconds(1)).toBe('1 second');
  });
});

describe('which language the app shows', () => {
  it('follows the phone: Albanian on an Albanian phone, English otherwise', () => {
    getLocales.mockReturnValue([{ languageCode: 'sq', languageTag: 'sq-AL' }]);
    resetLanguage();
    expect(language()).toBe('sq');
    getLocales.mockReturnValue([{ languageCode: 'de', languageTag: 'de-DE' }]);
    resetLanguage();
    expect(language()).toBe('en');
  });

  it('remembers the choice made with the switch, over the phone language', () => {
    getLocales.mockReturnValue([{ languageCode: 'sq', languageTag: 'sq-AL' }]);
    resetLanguage();
    setLanguage('en');
    expect(language()).toBe('en');
    expect(localStorage.getItem('gur.language')).toBe('en');
    expect(strings()).toBe(DICTIONARIES.en);
  });

  it('switches the first screen at once, and back', async () => {
    await render(<Home />);
    expect(screen.getByRole('button', { name: 'Play against bots' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to Shqip' }));
    expect(screen.getByRole('button', { name: 'Luaj kundër kompjuterit' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Luaj me shokë' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Luaj online' })).toBeOnTheScreen();
    expect(screen.getByText('Remi me gurë, si në Kosovë')).toBeOnTheScreen();
    expect(screen.getByTestId('language-switch')).toHaveTextContent('English');
    await fireEvent.press(screen.getByRole('button', { name: 'Kalo në English' }));
    expect(screen.getByRole('button', { name: 'Play against bots' })).toBeOnTheScreen();
    expect(screen.getByTestId('language-switch')).toHaveTextContent('Shqip');
  });

  it('asks for the bots game options in Albanian', async () => {
    setLanguage('sq');
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Luaj kundër kompjuterit' }));
    expect(screen.getByRole('switch', { name: 'Lejo 12-13-1' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '1 sekondë' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '5 sekonda' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fillo lojën' })).toBeOnTheScreen();
  });
});

describe('messages from the server and the rules', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  /** Every message the game server (LobbyError) and the rules engine (RuleError) can send, from their source. */
  function refusalsIn(dir: string, kind: string): string[] {
    const found = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      const pattern = new RegExp(`${kind}\\(\\s*([\\s\\S]*?)\\)`, 'g');
      for (const m of text.matchAll(pattern)) {
        for (const s of m[1]!.matchAll(/'([^']+)'/g)) found.add(s[1]!);
      }
    }
    return [...found];
  }
  // Checks that only a program error could break: a player never sees these.
  const INTERNAL = [
    'A deal must use every tile exactly once',
    'A game needs 2 to 4 players',
    'A printed joker cannot be the indicator',
    'One hand per player is required',
    'Unknown seat',
  ];

  it('has an Albanian text for every refusal a player can get', () => {
    const all = [
      ...refusalsIn(join(ROOT, 'apps', 'server', 'src'), 'LobbyError'),
      ...refusalsIn(join(ROOT, 'packages', 'engine', 'src'), 'RuleError'),
    ].filter((m) => m.includes(' ') && !INTERNAL.includes(m));
    expect(all.length).toBeGreaterThan(50);
    const missing = all.filter((m) => !DICTIONARIES.sq.refusals[m]);
    expect(missing).toEqual([]);
  });

  it('shows a refusal in the current language; one it does not know, as it came', () => {
    expect(translateRefusal('It is not your turn')).toBe('It is not your turn');
    setLanguage('sq');
    expect(translateRefusal('It is not your turn')).toBe('Nuk është radha jote');
    expect(translateRefusal('No lobby has that code. Check it and try again')).toBe(
      'Asnjë dhomë nuk e ka këtë kod. Kontrolloje dhe provo përsëri',
    );
    expect(translateRefusal('Keep it under 200 characters')).toBe('Mbaje nën 200 shkronja');
    expect(translateRefusal('Something new from the server')).toBe('Something new from the server');
  });
});

describe('tiles, moves and account answers in Albanian', () => {
  it('names tiles in each language', () => {
    expect(tileName(tileId('red', 7))).toBe('red 7');
    setLanguage('sq');
    expect(tileName(tileId('red', 7))).toBe('7 i kuq');
    expect(tileName(tileId('blue', 12))).toBe('12 i kaltër');
    expect(tileName(tileId('black', 1))).toBe('1 i zi');
    expect(tileName(tileId('yellow', 3))).toBe('3 i verdhë');
  });

  it('tells your own moves in the second person, and the others by name', () => {
    setLanguage('sq');
    const names = ['Ana', 'Ben', 'Cem'];
    const deal = (you: string, indicator: string): Deal => {
      const hands = [you, FILLER[0]!, FILLER[1]!].map(ts);
      const top = t('R9b');
      const used = new Set([...hands.flat(), t(indicator), top]);
      const rest = Array.from({ length: 106 }, (_, id) => id).filter((id) => !used.has(id));
      return { indicator: t(indicator), hands, middle: [top, ...rest] };
    };
    const game = (you = NORMAL, indicator = 'R12') =>
      createGameWithDeal({ aceHigh: true, rounds: 3 }, names, 1, deal(you, indicator));

    let g = discard(game(), 1, t('R9b'));
    expect(describeChange(playerView(game(), 0), playerView(g, 0), names)).toBe('Ben hodhi 9 i kuq');
    expect(describeChange(playerView(g, 0), playerView(draw(g, 2, 'middle'), 0), names)).toBe('Cem mori nga mesi');
    g = timeoutMove(discard(game(NEEDS_K13, 'K13'), 1, t('R9b')));
    const taken = draw(g, 0, 'indicator');
    expect(describeChange(playerView(g, 0), playerView(taken, 0), names)).toBe('More treguesin');
    expect(describeChange(playerView(taken, 0), playerView(timeoutMove(taken), 0), names)).toBe(
      'More treguesin dhe mbylle',
    );
    expect(describeChange(playerView(taken, 1), playerView(timeoutMove(taken), 1), names)).toBe(
      'Ana mori treguesin dhe mbylli',
    );
  });

  it('answers about names, friends and dates in Albanian', () => {
    setLanguage('sq');
    expect(usernameProblem('ab')).toBe('Emri duhet të ketë të paktën 3 shkronja');
    expect(addMessage('sent', 'Ben')).toBe('Kërkesa iu dërgua Ben');
    expect(addMessage('not_found', null)).toBe('Askush nuk e ka këtë emër ose ID');
    expect(when('2026-03-18T10:00:00Z', new Date('2026-11-25T10:00:00Z'))).toBe('18 Mar');
    expect(when('2026-08-04T10:00:00Z', new Date('2026-11-25T10:00:00Z'))).toBe('4 Gus');
    // and a fresh render after switching back shows English again
    setLanguage('en');
    expect(usernameProblem('ab')).toBe('A name needs at least 3 characters');
  });
});
