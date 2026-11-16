import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createGameServer } from '../src/server';
import type { GameServer } from '../src/server';
import type { Ack, ClientToServerEvents, LobbyState, ServerToClientEvents } from '../src/protocol';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer | undefined;
const clients: Client[] = [];

async function startServer(config: Parameters<typeof createGameServer>[0] = {}) {
  server = createGameServer({ lobby: { botDelayMs: [5, 10], nextRoundDelayMs: 50 }, ...config });
  await new Promise<void>((resolve) => server!.http.listen(0, resolve));
  return `http://localhost:${(server.http.address() as AddressInfo).port}`;
}

/** A connected player, with the latest state it was sent. */
async function connect(url: string) {
  const socket: Client = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  const seen: { state: LobbyState | null } = { state: null };
  socket.on('state', (state) => (seen.state = state));
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  return { socket, seen };
}

/** Sends a request and waits for the server's answer. */
function ask<T>(send: (reply: (answer: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => send(resolve));
}

/** Waits until the latest state satisfies a condition. */
async function until(seen: { state: LobbyState | null }, ready: (state: LobbyState) => boolean) {
  for (let i = 0; i < 400; i++) {
    if (seen.state && ready(seen.state)) return seen.state;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The expected state never arrived');
}

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.disconnect();
  await server?.close();
  server = undefined;
});

describe('the game server', () => {
  it('answers a health check', async () => {
    const url = await startServer();
    expect(await (await fetch(`${url}/health`)).text()).toBe('Gur game server: ok (guests only)\n');
    expect((await fetch(`${url}/nothing-here`)).status).toBe(404);
  });

  it('two friends meet in a lobby by code, start, and each sees only their own tiles', async () => {
    const url = await startServer();
    const ana = await connect(url);
    const ben = await connect(url);

    const created = await ask<{ code: string; memberId: string }>((reply) =>
      ana.socket.emit('create', { name: 'Ana', settings: { rounds: 3 } }, reply),
    );
    if (!created.ok) throw new Error(created.error);
    expect(created.code).toHaveLength(5);

    const joined = await ask<{ code: string; memberId: string }>((reply) =>
      ben.socket.emit('join', { code: created.code.toLowerCase(), name: 'Ben' }, reply),
    );
    expect(joined).toMatchObject({ ok: true, code: created.code });
    const lobby = await until(ana.seen, (s) => s.members.length === 2);
    expect(lobby.members.map((m) => m.name)).toEqual(['Ana', 'Ben']);
    expect(lobby.settings.rounds).toBe(3);

    // only the host starts
    expect(await ask((reply) => ben.socket.emit('start', reply))).toMatchObject({ ok: false });
    expect(await ask((reply) => ana.socket.emit('start', reply))).toEqual({ ok: true });

    const a = await until(ana.seen, (s) => s.game !== null);
    const b = await until(ben.seen, (s) => s.game !== null);
    expect(a.you).toBe(0);
    expect(b.you).toBe(1);
    expect(a.game!.players[1]!.groups).toBeNull();
    expect(b.game!.players[0]!.groups).toBeNull();
    expect(b.game!.players[1]!.groups!.flat().length).toBeGreaterThanOrEqual(14);

    // a move by the player to move reaches both; a move out of turn is refused with words
    const [mover, other] = a.game!.round.current === 0 ? [ana, ben] : [ben, ana];
    const refused = await ask((reply) => other.socket.emit('action', { type: 'draw', source: 'middle' }, reply));
    expect(refused.ok).toBe(false);
    const seat = mover.seen.state!.you;
    const tile = mover.seen.state!.game!.players[seat]!.groups!.flat()[0]!;
    expect(await ask((reply) => mover.socket.emit('action', { type: 'discard', tile }, reply))).toEqual({ ok: true });
    const after = await until(other.seen, (s) => s.game!.round.lastDiscard !== null);
    expect(after.game!.round.lastDiscard).toEqual({ tile, by: seat });
    expect(after.turnEndsAt).toBeGreaterThan(after.now);
  });

  it('refuses a bad code, a bad name, and requests from outside a lobby', async () => {
    const url = await startServer();
    const ana = await connect(url);
    expect(await ask((reply) => ana.socket.emit('join', { code: 'NOPE1', name: 'Ana' }, reply))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No lobby has that code/),
    });
    expect(await ask((reply) => ana.socket.emit('create', { name: '   ' }, reply))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/choose a name/),
    });
    for (const send of [
      (reply: (a: Ack) => void) => ana.socket.emit('start', reply),
      (reply: (a: Ack) => void) => ana.socket.emit('next', reply),
      (reply: (a: Ack) => void) => ana.socket.emit('settings', { rounds: 3 }, reply),
      (reply: (a: Ack) => void) => ana.socket.emit('action', { type: 'draw', source: 'middle' }, reply),
    ]) {
      expect(await ask(send)).toEqual({ ok: false, error: 'You are not in a lobby' });
    }
    // malformed requests are refused, not fatal
    expect(await ask((reply) => ana.socket.emit('create', undefined as never, reply))).toMatchObject({ ok: false });
    expect(await ask((reply) => ana.socket.emit('rejoin', { code: 'NOPE1', memberId: 'x' }, reply))).toMatchObject({
      ok: false,
    });
    expect(server!.lobbies.size).toBeLessThanOrEqual(2);
  });

  it('a player who loses the connection keeps their seat and gets back in with their key', async () => {
    const url = await startServer();
    const ana = await connect(url);
    const ben = await connect(url);
    const created = await ask<{ code: string; memberId: string }>((reply) =>
      ana.socket.emit('create', { name: 'Ana' }, reply),
    );
    if (!created.ok) throw new Error(created.error);
    const joined = await ask<{ code: string; memberId: string }>((reply) =>
      ben.socket.emit('join', { code: created.code, name: 'Ben' }, reply),
    );
    if (!joined.ok) throw new Error(joined.error);
    await ask((reply) => ana.socket.emit('start', reply));

    ben.socket.disconnect();
    await until(ana.seen, (s) => s.members[1]!.connected === false);

    const back = await connect(url);
    // a wrong key does not get in
    expect(
      await ask((reply) => back.socket.emit('rejoin', { code: created.code, memberId: 'not-the-key' }, reply)),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/no longer in that lobby/) });
    expect(
      await ask((reply) => back.socket.emit('rejoin', { code: created.code, memberId: joined.memberId }, reply)),
    ).toEqual({ ok: true });
    const state = await until(back.seen, (s) => s.game !== null);
    expect(state.you).toBe(1);
    expect(state.game!.players[1]!.groups).not.toBeNull();
    await until(ana.seen, (s) => s.members[1]!.connected === true);
  });

  it('leaving frees the seat; when everyone has left the lobby is gone', async () => {
    const url = await startServer();
    const ana = await connect(url);
    const ben = await connect(url);
    const created = await ask<{ code: string; memberId: string }>((reply) =>
      ana.socket.emit('create', { name: 'Ana' }, reply),
    );
    if (!created.ok) throw new Error(created.error);
    await ask((reply) => ben.socket.emit('join', { code: created.code, name: 'Ben' }, reply));
    expect(await ask((reply) => ben.socket.emit('leave', reply))).toEqual({ ok: true });
    const alone = await until(ana.seen, (s) => s.members.length === 1);
    expect(alone.members[0]).toMatchObject({ name: 'Ana', host: true });
    // creating a new lobby leaves the old one
    const second = await ask<{ code: string; memberId: string }>((reply) =>
      ana.socket.emit('create', { name: 'Ana' }, reply),
    );
    if (!second.ok) throw new Error(second.error);
    expect(second.code).not.toBe(created.code);
    expect(server!.lobbies.size).toBe(1);
    expect(await ask((reply) => ben.socket.emit('join', { code: created.code, name: 'Ben' }, reply))).toMatchObject({
      ok: false,
    });
  });

  it('uses the checked name and picture of a signed-in player, and gives them their own seat back', async () => {
    const accounts: Record<string, { userId: string; username: string; publicId: string; avatarUrl: string | null }> = {
      'token-ana': {
        userId: 'u-ana',
        username: 'AnaK',
        publicId: '48213377',
        avatarUrl: 'https://example.com/ana.png',
      },
    };
    const url = await startServer({ verify: async (token) => accounts[token] ?? null });
    expect(await (await fetch(`${url}/health`)).text()).toBe('Gur game server: ok (accounts on)\n');
    const ana = await connect(url);
    const ben = await connect(url);

    // the name she typed is ignored: the profile decides
    const created = await ask<{ code: string; memberId: string }>((reply) =>
      ana.socket.emit('create', { name: 'Queen of Gur', token: 'token-ana' }, reply),
    );
    if (!created.ok) throw new Error(created.error);
    await ask((reply) => ben.socket.emit('join', { code: created.code, name: 'Ben', token: null }, reply));
    const lobby = await until(ben.seen, (s) => s.members.length === 2);
    expect(lobby.members[0]).toMatchObject({
      name: 'AnaK',
      avatarUrl: 'https://example.com/ana.png',
      publicId: '48213377',
    });
    expect(lobby.members[1]).toMatchObject({ name: 'Ben', avatarUrl: null, publicId: null });

    // a token that is not valid (any more) is refused, for creating and for joining
    const expired = { ok: false, error: expect.stringMatching(/sign-in has expired/) };
    expect(await ask((reply) => ben.socket.emit('create', { name: 'Ben', token: 'made-up' }, reply))).toMatchObject(
      expired,
    );
    expect(
      await ask((reply) =>
        ben.socket.emit('join', { code: created.code, name: 'Ben', token: { not: 'a string' } as never }, reply),
      ),
    ).toMatchObject(expired);

    // Ana opens the game on a second device, mid-game, without her key to the lobby:
    // her account gets her the same seat, and nobody new appears at the table
    await ask((reply) => ana.socket.emit('start', reply));
    const phone = await connect(url);
    const again = await ask<{ code: string; memberId: string }>((reply) =>
      phone.socket.emit('join', { code: created.code, name: '', token: 'token-ana' }, reply),
    );
    expect(again).toEqual({ ok: true, code: created.code, memberId: created.memberId });
    const onPhone = await until(phone.seen, (s) => s.game !== null);
    expect(onPhone.you).toBe(0);
    expect(onPhone.members).toHaveLength(2);
    expect(onPhone.game!.players[0]!.groups).not.toBeNull();
    // a guest still cannot walk into a game in progress
    const late = await connect(url);
    expect(await ask((reply) => late.socket.emit('join', { code: created.code, name: 'Cem' }, reply))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already started/),
    });
  });

  it('without accounts set up, a token is ignored and everybody is a guest', async () => {
    const url = await startServer();
    const ana = await connect(url);
    const created = await ask<{ code: string }>((reply) =>
      ana.socket.emit('create', { name: 'Ana', token: 'anything' }, reply),
    );
    expect(created.ok).toBe(true);
    expect((await until(ana.seen, (s) => s.members.length === 1)).members[0]).toMatchObject({
      name: 'Ana',
      publicId: null,
    });
  });

  it('plays a whole match against bots and returns to the lobby', async () => {
    const url = await startServer();
    const ana = await connect(url);
    await ask((reply) => ana.socket.emit('create', { name: 'Ana', settings: { fillWithBots: true } }, reply));
    expect(await ask((reply) => ana.socket.emit('start', reply))).toEqual({ ok: true });
    await until(ana.seen, (s) => s.game !== null);

    // Ana plays the simplest legal game: draw, then discard her first tile
    for (let i = 0; i < 400 && ana.seen.state!.game!.status === 'playing'; i++) {
      const { game, you } = ana.seen.state!;
      if (game!.round.current === you) {
        if (game!.round.phase === 'draw') {
          await ask((reply) => ana.socket.emit('action', { type: 'draw', source: 'middle' }, reply));
        } else {
          const tile = game!.players[you]!.groups!.flat()[0]!;
          await ask((reply) => ana.socket.emit('action', { type: 'discard', tile }, reply));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const over = await until(ana.seen, (s) => s.game?.status === 'matchOver');
    expect(over.game!.results).toHaveLength(1);
    expect(over.game!.players.every((p) => p.groups !== null)).toBe(true);
    expect(await ask((reply) => ana.socket.emit('next', reply))).toEqual({ ok: true });
    const back = await until(ana.seen, (s) => s.game === null);
    expect(back.members).toHaveLength(1);
  }, 30_000);
});
