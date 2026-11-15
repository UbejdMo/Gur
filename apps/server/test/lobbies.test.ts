import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRng } from '@gur/engine';
import { CODE_LENGTH, Lobbies, normalizeCode } from '../src/lobbies';
import { LobbyError } from '../src/lobby';
import type { Lobby } from '../src/lobby';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function makeLobbies(config: Partial<ConstructorParameters<typeof Lobbies>[0]> = {}) {
  const changed: Lobby[] = [];
  const lobbies = new Lobbies({ rng: seededRng(5), onChange: (lobby) => changed.push(lobby), ...config });
  return { lobbies, changed };
}

describe('lobby codes', () => {
  it('are five characters that are easy to read out, and never repeat', () => {
    const { lobbies } = makeLobbies({ maxLobbies: 300 });
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const lobby = lobbies.create();
      lobby.join('Ana');
      codes.add(lobby.code);
      expect(lobby.code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
      expect(lobby.code).toHaveLength(CODE_LENGTH);
    }
    expect(codes.size).toBe(200);
    expect(lobbies.size).toBe(200);
  });

  it('are found however they are typed', () => {
    const { lobbies } = makeLobbies();
    const lobby = lobbies.create();
    lobby.join('Ana');
    const typed = ` ${lobby.code.slice(0, 2).toLowerCase()} ${lobby.code.slice(2).toLowerCase()} `;
    expect(lobbies.find(typed)).toBe(lobby);
    expect(normalizeCode(typed)).toBe(lobby.code);
    expect(() => lobbies.find('ZZZZZ')).toThrow(/No lobby has that code/);
    expect(() => lobbies.find(undefined)).toThrow(LobbyError);
    expect(normalizeCode(12345)).toBe('');
  });
});

describe('keeping the list clean', () => {
  it('tells the server when a lobby changed', () => {
    const { lobbies, changed } = makeLobbies();
    const lobby = lobbies.create();
    lobby.join('Ana');
    lobby.join('Ben');
    expect(changed).toEqual([lobby, lobby]);
  });

  it('drops a lobby as soon as its last player leaves', () => {
    const { lobbies, changed } = makeLobbies();
    const lobby = lobbies.create();
    const ana = lobby.join('Ana');
    changed.length = 0;
    lobby.leave(ana);
    expect(lobbies.size).toBe(0);
    expect(changed).toEqual([]);
    expect(() => lobbies.find(lobby.code)).toThrow(LobbyError);
  });

  it('drops a lobby nobody has been connected to for ten minutes', () => {
    const { lobbies } = makeLobbies();
    const lobby = lobbies.create();
    const ana = lobby.join('Ana');
    lobby.setConnected(ana, false);
    vi.advanceTimersByTime(9 * 60_000);
    lobbies.sweep();
    expect(lobbies.size).toBe(1);
    vi.advanceTimersByTime(60_000);
    lobbies.sweep();
    expect(lobbies.size).toBe(0);
  });

  it('refuses new lobbies when the server is full, and makes room by clearing dead ones first', () => {
    const { lobbies } = makeLobbies({ maxLobbies: 2 });
    const first = lobbies.create();
    const ana = first.join('Ana');
    lobbies.create().join('Ben');
    expect(() => lobbies.create()).toThrow(/server is full/);
    // a lobby whose only player never arrived (a bad name) is cleared before counting
    first.leave(ana);
    expect(lobbies.create().code).toHaveLength(CODE_LENGTH);
  });

  it('stops every clock on shutdown', () => {
    const { lobbies } = makeLobbies();
    const lobby = lobbies.create();
    const ana = lobby.join('Ana');
    lobby.setSettings(ana, { fillWithBots: true });
    lobby.start(ana);
    lobbies.dispose();
    expect(lobbies.size).toBe(0);
    const turn = lobby.stateFor(ana).game!.round.turn;
    vi.advanceTimersByTime(60_000);
    expect(lobby.stateFor(ana).game!.round.turn).toBe(turn);
  });
});
