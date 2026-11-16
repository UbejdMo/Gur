import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRng } from '@gur/engine';
import { Lobby, LobbyError, cleanName, realScheduler } from '../src/lobby';
import type { LobbyConfig } from '../src/lobby';

/** A lobby on fake time, with a counter for how often it told its players something changed. */
function makeLobby(config: Partial<LobbyConfig> = {}) {
  let ids = 0;
  const seen = { changes: 0 };
  const lobby = new Lobby({
    code: 'ABCDE',
    rng: seededRng(42),
    scheduler: realScheduler,
    newId: () => `id-${++ids}`,
    onChange: () => seen.changes++,
    botDelayMs: [1000, 1000],
    ...config,
  });
  return { lobby, seen };
}

/** Two friends in a started game. */
function startedGame(config: Partial<LobbyConfig> = {}) {
  const made = makeLobby(config);
  const ana = made.lobby.join('Ana');
  const ben = made.lobby.join('Ben');
  made.lobby.start(ana);
  return { ...made, ana, ben, ids: [ana, ben] };
}

/** The current player draws from the middle if they still have to, then discards their first tile. */
function playTurn(lobby: Lobby, ids: string[]) {
  const seat = lobby.stateFor(ids[0]!).game!.round.current;
  const id = ids[seat]!;
  if (lobby.stateFor(id).game!.round.phase === 'draw') lobby.act(id, { type: 'draw', source: 'middle' });
  const mine = lobby.stateFor(id).game!.players[seat]!.groups!.flat();
  lobby.act(id, { type: 'discard', tile: mine[0]! });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('joining', () => {
  it('the first player is the host; everyone sees who is here', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    const ben = lobby.join('  Ben  ');
    const state = lobby.stateFor(ben);
    expect(state).toMatchObject({ code: 'ABCDE', you: 1, game: null, turnEndsAt: null, nextRoundAt: null });
    expect(state.members).toEqual([
      { name: 'Ana', bot: false, connected: true, host: true, avatarUrl: null, publicId: null },
      { name: 'Ben', bot: false, connected: true, host: false, avatarUrl: null, publicId: null },
    ]);
    expect(lobby.stateFor(ana).you).toBe(0);
    expect(lobby.memberIds()).toEqual([ana, ben]);
  });

  it('cleans names and never lets two players share one', () => {
    const { lobby } = makeLobby();
    lobby.join('Ana');
    lobby.join('ana');
    lobby.join('<b>Ana</b>   the   Great of Prishtina');
    expect(lobby.stateFor('id-1').members.map((m) => m.name)).toEqual(['Ana', 'ana 2', 'bAnab the Great']);
    expect(cleanName('  Ubejd  ')).toBe('Ubejd');
    expect(cleanName('Çelë Ö-1')).toBe('Çelë Ö-1');
    expect(() => cleanName('   ')).toThrow(LobbyError);
    expect(() => cleanName('<>')).toThrow(/choose a name/);
    expect(() => cleanName(42)).toThrow(LobbyError);
  });

  it('holds four players, and nobody joins a game in progress', () => {
    const { lobby } = makeLobby();
    const host = lobby.join('A');
    lobby.join('B');
    lobby.join('C');
    lobby.join('D');
    expect(() => lobby.join('E')).toThrow(/full/);
    lobby.start(host);
    expect(() => lobby.join('E')).toThrow(/already started/);
  });

  it('a player who leaves before the game frees their place; the host role passes on', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    const ben = lobby.join('Ben');
    lobby.leave(ana);
    expect(lobby.stateFor(ben).members).toEqual([
      { name: 'Ben', bot: false, connected: true, host: true, avatarUrl: null, publicId: null },
    ]);
    expect(() => lobby.stateFor(ana)).toThrow(/not in this lobby/);
    expect(() => lobby.leave(ana)).toThrow(LobbyError);
    lobby.leave(ben);
    expect(lobby.abandoned).toBe(true);
  });
});

describe('players with an account', () => {
  const ana = { userId: 'user-ana', username: 'AnaK', publicId: '48213377', avatarUrl: 'https://example.com/ana.png' };

  it('go by their profile name and show their picture and id; guests show neither', () => {
    const { lobby } = makeLobby();
    const id = lobby.join('whatever they typed', ana);
    lobby.join('Ben');
    expect(lobby.stateFor(id).members).toEqual([
      { name: 'AnaK', bot: false, connected: true, host: true, avatarUrl: ana.avatarUrl, publicId: '48213377' },
      { name: 'Ben', bot: false, connected: true, host: false, avatarUrl: null, publicId: null },
    ]);
  });

  it('are found again by their account, until they leave', () => {
    const { lobby } = makeLobby();
    const id = lobby.join('', ana);
    const guest = lobby.join('Ben');
    expect(lobby.seatOfAccount('user-ana')).toBe(id);
    expect(lobby.seatOfAccount('user-nobody')).toBeNull();
    lobby.start(id);
    expect(lobby.seatOfAccount('user-ana')).toBe(id);
    lobby.leave(id);
    expect(lobby.seatOfAccount('user-ana')).toBeNull();
    expect(lobby.has(guest)).toBe(true);
  });

  it('a guest who took the name first keeps it: the account holder gets a number', () => {
    const { lobby } = makeLobby();
    lobby.join('anak');
    const id = lobby.join('', ana);
    expect(lobby.stateFor(id).members.map((m) => m.name)).toEqual(['anak', 'AnaK 2']);
  });
});

describe('options and starting', () => {
  it('only the host changes the options, and only to valid ones', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    const ben = lobby.join('Ben');
    lobby.setSettings(ana, { aceHigh: false, rounds: 3 });
    expect(lobby.stateFor(ben).settings).toEqual({ aceHigh: false, rounds: 3, fillWithBots: false });
    expect(() => lobby.setSettings(ben, { rounds: 5 })).toThrow(/Only the player who created/);
    expect(() => lobby.setSettings(ana, { rounds: 2 as 1 })).toThrow(/1, 3 or 5/);
    expect(() => lobby.setSettings(ana, { aceHigh: 'yes' as unknown as boolean })).toThrow(LobbyError);
    expect(() => lobby.setSettings(ana, { fillWithBots: 1 as unknown as boolean })).toThrow(LobbyError);
    lobby.start(ana);
    expect(() => lobby.setSettings(ana, { rounds: 5 })).toThrow(/during a game/);
  });

  it('needs two players, or bots to fill the table', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    expect(() => lobby.start(ana)).toThrow(/at least 2 players/);
    lobby.setSettings(ana, { fillWithBots: true });
    lobby.start(ana);
    const state = lobby.stateFor(ana);
    expect(state.members.map((m) => [m.name, m.bot])).toEqual([
      ['Ana', false],
      ['Bot 1', true],
      ['Bot 2', true],
      ['Bot 3', true],
    ]);
    expect(state.game!.players).toHaveLength(4);
    expect(lobby.memberIds()).toEqual([ana]);
    expect(() => lobby.start(ana)).toThrow(/already started/);
  });

  it('only the host starts the game, with the options chosen', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    const ben = lobby.join('Ben');
    lobby.setSettings(ana, { aceHigh: false, rounds: 5 });
    expect(() => lobby.start(ben)).toThrow(/Only the player who created/);
    lobby.start(ana);
    expect(lobby.stateFor(ben).game!.settings).toEqual({ aceHigh: false, rounds: 5 });
    expect(lobby.stateFor(ben).game!.players.map((p) => p.id)).toEqual(['Ana', 'Ben']);
  });
});

describe('playing', () => {
  it('each player sees their own rack and only the size of the others', () => {
    const { lobby, ana, ben } = startedGame();
    const a = lobby.stateFor(ana).game!;
    const b = lobby.stateFor(ben).game!;
    expect(a.seat).toBe(0);
    expect(b.seat).toBe(1);
    expect(a.players[0]!.groups).not.toBeNull();
    expect(a.players[1]!.groups).toBeNull();
    expect(b.players[0]!.groups).toBeNull();
    expect(a.players[1]!.tileCount).toBe(b.players[1]!.groups!.flat().length);
    expect(a.round).not.toHaveProperty('middle');
  });

  it('the engine decides: a move out of turn or against the rules is refused in words', () => {
    const { lobby, ids } = startedGame();
    const current = lobby.stateFor(ids[0]!).game!.round.current;
    const other = ids[1 - current]!;
    expect(() => lobby.act(other, { type: 'draw', source: 'middle' })).toThrow(LobbyError);
    // the starter already holds 15 tiles: they must discard, not draw
    expect(() => lobby.act(ids[current]!, { type: 'draw', source: 'middle' })).toThrow(LobbyError);
    const view = lobby.stateFor(ids[current]!).game!;
    const mine = view.players[current]!.groups!.flat();
    const notMine = Array.from({ length: 106 }, (_, tile) => tile).find((tile) => !mine.includes(tile))!;
    expect(() => lobby.act(ids[current]!, { type: 'discard', tile: notMine })).toThrow(/not in your hand/);
    if (!view.round.restartOffered) {
      expect(() => lobby.act(ids[current]!, { type: 'acceptRestart' })).toThrow(/not offered a restart/);
    }
    expect(() => lobby.act('nobody', { type: 'draw', source: 'middle' })).toThrow(/not in this lobby/);
  });

  it('refuses anything that is not a proper move', () => {
    const { lobby, ids } = startedGame();
    const id = ids[lobby.stateFor(ids[0]!).game!.round.current]!;
    const bad = [
      null,
      { type: 'fly' },
      { type: 'draw', source: 'sleeve' },
      { type: 'discard', tile: 'R4' },
      { type: 'discard', tile: 106 },
      { type: 'close', tile: -1 },
      { type: 'arrange', groups: 'all' },
      { type: 'arrange', groups: [[1, 'x']] },
    ];
    for (const action of bad) expect(() => lobby.act(id, action as never)).toThrow(/not valid/);
  });

  it('players can arrange their rack at any time; a draw and a discard pass the turn', () => {
    const { lobby, ids, seen } = startedGame();
    const first = lobby.stateFor(ids[0]!).game!.round.current;
    const waiting = ids[1 - first]!;
    const rack = lobby.stateFor(waiting).game!.players[1 - first]!.groups!.flat();
    lobby.act(waiting, { type: 'arrange', groups: [rack.slice(0, 3), rack.slice(3)] });
    expect(lobby.stateFor(waiting).game!.players[1 - first]!.groups).toEqual([rack.slice(0, 3), rack.slice(3)]);
    expect(() => lobby.act(waiting, { type: 'arrange', groups: [rack.slice(1)] })).toThrow(/exactly your tiles/);

    const before = seen.changes;
    playTurn(lobby, ids);
    const round = lobby.stateFor(waiting).game!.round;
    expect(round.current).toBe(1 - first);
    expect(round.phase).toBe('draw');
    expect(round.lastDiscard?.by).toBe(first);
    expect(seen.changes).toBeGreaterThan(before);
  });
});

describe('the clock', () => {
  it('gives a player 15 seconds, then plays the timeout move for them', () => {
    const { lobby, ids } = startedGame();
    const first = lobby.stateFor(ids[0]!).game!.round.current;
    const started = Date.now();
    expect(lobby.stateFor(ids[0]!).turnEndsAt).toBe(started + 15_000);
    vi.advanceTimersByTime(14_900);
    expect(lobby.stateFor(ids[0]!).game!.round.current).toBe(first);
    vi.advanceTimersByTime(200);
    const round = lobby.stateFor(ids[0]!).game!.round;
    expect(round.current).toBe(1 - first);
    expect(round.lastDiscard?.by).toBe(first);
    // the next player gets a fresh 15 seconds, counted from the moment the turn passed
    expect(lobby.stateFor(ids[0]!).turnEndsAt).toBe(started + 30_000);
  });

  it('drawing or moving tiles does not buy more time', () => {
    const { lobby, ids } = startedGame();
    playTurn(lobby, ids);
    const seat = lobby.stateFor(ids[0]!).game!.round.current;
    const id = ids[seat]!;
    const ends = lobby.stateFor(id).turnEndsAt;
    vi.advanceTimersByTime(5_000);
    lobby.act(id, { type: 'draw', source: 'middle' });
    const rack = lobby.stateFor(id).game!.players[seat]!.groups!.flat();
    lobby.act(id, { type: 'arrange', groups: [rack] });
    expect(lobby.stateFor(id).turnEndsAt).toBe(ends);
    vi.advanceTimersByTime(10_100);
    expect(lobby.stateFor(id).game!.round.current).toBe(1 - seat);
  });

  it('bots take their turn after a short pause, with no countdown shown', () => {
    const { lobby } = makeLobby();
    const ana = lobby.join('Ana');
    lobby.setSettings(ana, { fillWithBots: true });
    lobby.start(ana);
    // let the table go round until it is a bot's turn
    while (lobby.stateFor(ana).game!.round.current === 0) playTurn(lobby, [ana]);
    const bot = lobby.stateFor(ana).game!.round.current;
    expect(lobby.stateFor(ana).turnEndsAt).toBeNull();
    vi.advanceTimersByTime(900);
    expect(lobby.stateFor(ana).game!.round.current).toBe(bot);
    vi.advanceTimersByTime(200);
    expect(lobby.stateFor(ana).game!.round.current).not.toBe(bot);
  });
});

describe('dropping out', () => {
  it('a dropped connection keeps the seat; the clock plays for them until they are back', () => {
    const { lobby, ana, ben } = startedGame();
    lobby.setConnected(ben, false);
    expect(lobby.stateFor(ana).members[1]).toMatchObject({ name: 'Ben', connected: false });
    expect(lobby.emptyFor()).toBe(0);
    lobby.setConnected(ana, false);
    vi.advanceTimersByTime(60_000);
    expect(lobby.emptyFor()).toBe(60_000);
    expect(lobby.abandoned).toBe(false);
    // the game went on by timeout moves meanwhile
    expect(lobby.stateFor(ana).game!.round.turn).toBe(4);
    lobby.setConnected(ben, true);
    lobby.setConnected(ben, true);
    expect(lobby.emptyFor()).toBe(0);
    expect(lobby.stateFor(ana).members[1]!.connected).toBe(true);
  });

  it('when a player leaves a game, it plays on for them without waiting out their clock', () => {
    const { lobby, ana, ben, ids } = startedGame({ awayDelayMs: 1000 });
    // make it Ben's turn, then Ben walks away
    while (lobby.stateFor(ana).game!.round.current !== 1) playTurn(lobby, ids);
    lobby.leave(ben);
    expect(lobby.stateFor(ana).members[1]).toMatchObject({ name: 'Ben', connected: false });
    expect(lobby.memberIds()).toEqual([ana]);
    expect(() => lobby.act(ben, { type: 'draw', source: 'middle' })).toThrow(/not in this lobby/);
    vi.advanceTimersByTime(1_100);
    expect(lobby.stateFor(ana).game!.round.current).toBe(0);
    // and again on Ben's next turn
    playTurn(lobby, [ana]);
    expect(lobby.stateFor(ana).turnEndsAt).toBeNull();
    vi.advanceTimersByTime(1_100);
    expect(lobby.stateFor(ana).game!.round.current).toBe(0);
  });

  it('when the host leaves a game, the next player becomes the host; when all leave, the lobby is done', () => {
    const { lobby, ana, ben } = startedGame();
    lobby.leave(ana);
    expect(lobby.stateFor(ben).members.map((m) => m.host)).toEqual([false, true]);
    expect(lobby.abandoned).toBe(false);
    lobby.leave(ben);
    expect(lobby.abandoned).toBe(true);
  });
});

describe('rounds and the end of the match', () => {
  /** One player and three bots; the player never moves, so the clock plays for them. */
  function soloMatch(rounds: 1 | 3) {
    const made = makeLobby({ nextRoundDelayMs: 12_000 });
    const ana = made.lobby.join('Ana');
    made.lobby.setSettings(ana, { fillWithBots: true, rounds });
    made.lobby.start(ana);
    const status = () => made.lobby.stateFor(ana).game?.status;
    const runUntil = (wanted: string) => {
      for (let i = 0; i < 4000 && status() !== wanted; i++) vi.advanceTimersByTime(1_000);
      expect(status()).toBe(wanted);
    };
    return { ...made, ana, status, runUntil };
  }

  it('after a round the results stay up, then the next round starts by itself', () => {
    const { lobby, ana, runUntil } = soloMatch(3);
    runUntil('roundOver');
    const state = lobby.stateFor(ana);
    expect(state.nextRoundAt).toBe(Date.now() + 12_000);
    expect(state.turnEndsAt).toBeNull();
    // every rack is shown with the results
    expect(state.game!.players.every((p) => p.groups !== null)).toBe(true);
    expect(() => lobby.act(ana, { type: 'draw', source: 'middle' })).toThrow(LobbyError);
    vi.advanceTimersByTime(12_100);
    const next = lobby.stateFor(ana);
    expect(next.game!.status).toBe('playing');
    expect(next.game!.round.number).toBe(2);
    expect(next.nextRoundAt).toBeNull();
  });

  it('the host can start the next round at once; nobody else can', () => {
    const made = makeLobby();
    const ana = made.lobby.join('Ana');
    const ben = made.lobby.join('Ben');
    made.lobby.setSettings(ana, { rounds: 3 });
    made.lobby.start(ana);
    expect(() => made.lobby.next(ana)).toThrow(/still being played/);
    for (let i = 0; i < 4000 && made.lobby.stateFor(ana).game!.status === 'playing'; i++) vi.advanceTimersByTime(1_000);
    expect(made.lobby.stateFor(ana).game!.status).toBe('roundOver');
    expect(() => made.lobby.next(ben)).toThrow(/Only the player who created/);
    made.lobby.next(ana);
    expect(made.lobby.stateFor(ben).game!.round.number).toBe(2);
    // the timer that would have started the round was cancelled: it does not skip a round later
    vi.advanceTimersByTime(13_000);
    expect(made.lobby.stateFor(ben).game!.round.number).toBe(2);
  });

  it('after the match the host takes everyone back to the lobby, without the bots', () => {
    const { lobby, ana, runUntil } = soloMatch(1);
    runUntil('matchOver');
    const over = lobby.stateFor(ana);
    expect(over.game!.matchWinners.length).toBeGreaterThan(0);
    expect(over.nextRoundAt).toBeNull();
    expect(over.turnEndsAt).toBeNull();
    lobby.next(ana);
    const back = lobby.stateFor(ana);
    expect(back.game).toBeNull();
    expect(back.members).toEqual([
      { name: 'Ana', bot: false, connected: true, host: true, avatarUrl: null, publicId: null },
    ]);
    // and a new game can start
    lobby.start(ana);
    expect(lobby.stateFor(ana).game!.status).toBe('playing');
  });

  it('stops its clocks when it is thrown away', () => {
    const { lobby, ana } = soloMatch(1);
    const turn = lobby.stateFor(ana).game!.round.turn;
    lobby.dispose();
    vi.advanceTimersByTime(120_000);
    expect(lobby.stateFor(ana).game!.round.turn).toBe(turn);
  });
});
