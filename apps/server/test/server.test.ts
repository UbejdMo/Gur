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

describe('inviting friends', () => {
  const ANA = {
    userId: '00000000-0000-4000-8000-0000000000a1',
    username: 'AnaK',
    publicId: '11111111',
    avatarUrl: null,
  };
  const BEN = {
    userId: '00000000-0000-4000-8000-0000000000b1',
    username: 'BenM',
    publicId: '22222222',
    avatarUrl: null,
  };
  const CEM = {
    userId: '00000000-0000-4000-8000-0000000000c1',
    username: 'CemB',
    publicId: '33333333',
    avatarUrl: null,
  };
  const accounts: Record<string, typeof ANA> = { 'token-ana': ANA, 'token-ben': BEN, 'token-cem': CEM };
  /** Ana and Ben are friends; Cem is nobody's friend. */
  const friendsOf: Record<string, string[]> = { [ANA.userId]: [BEN.userId], [BEN.userId]: [ANA.userId] };

  async function setUp() {
    let clock = 1_000_000;
    const checks: string[] = [];
    const url = await startServer({
      verify: async (token) => accounts[token] ?? null,
      areFriends: async (token, userId) => {
        checks.push(`${accounts[token]?.username}->${userId}`);
        return (friendsOf[accounts[token]?.userId ?? ''] ?? []).includes(userId);
      },
      inviteMs: 10_000,
      now: () => clock,
    });
    const tick = (ms: number) => (clock += ms);
    return { url, checks, tick };
  }

  /** A signed-in player with the game open, collecting the invites they get. */
  async function present(url: string, token: string) {
    const player = await connect(url);
    const invites: unknown[] = [];
    player.socket.on('invited', (invite) => invites.push(invite));
    expect(await ask((reply) => player.socket.emit('hello', { token }, reply))).toEqual({ ok: true });
    return { ...player, invites };
  }

  async function lobbyOf(player: { socket: Client }, token: string | null) {
    const created = await ask<{ code: string; memberId: string }>((reply) =>
      player.socket.emit('create', { name: 'Guest', token }, reply),
    );
    if (!created.ok) throw new Error(created.error);
    return created.code;
  }

  const invite = (player: { socket: Client }, userId: string, token: string | null = 'token-ana') =>
    ask<{ seconds: number }>((reply) => player.socket.emit('invite', { userId, token }, reply));

  /** Lets the server's messages arrive. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('the host invites a friend who has the game open; the invite reaches all their open apps', async () => {
    const { url, checks } = await setUp();
    const ana = await present(url, 'token-ana');
    const benPhone = await present(url, 'token-ben');
    const benLaptop = await present(url, 'token-ben');
    const code = await lobbyOf(ana, 'token-ana');

    expect(await invite(ana, BEN.userId)).toEqual({ ok: true, seconds: 10 });
    await settle();
    const expected = { code, from: { name: 'AnaK', avatarUrl: null }, seconds: 10 };
    expect(benPhone.invites).toEqual([expected]);
    expect(benLaptop.invites).toEqual([expected]);
    expect(ana.invites).toEqual([]);
    expect(checks).toEqual([`AnaK->${BEN.userId}`]);

    // Ben accepts by joining with the code
    const joined = await ask((reply) => benPhone.socket.emit('join', { code, name: '', token: 'token-ben' }, reply));
    expect(joined).toMatchObject({ ok: true });
    const lobby = await until(ana.seen, (s) => s.members.length === 2);
    expect(lobby.members[1]!.name).toBe('BenM');
    // once he is in, he cannot be invited again
    expect(await invite(ana, BEN.userId)).toMatchObject({ error: 'Your friend is already in the lobby' });
  });

  it('an invite lasts ten seconds; until then it cannot be sent again', async () => {
    const { url, tick } = await setUp();
    const ana = await present(url, 'token-ana');
    const ben = await present(url, 'token-ben');
    await lobbyOf(ana, 'token-ana');

    expect(await invite(ana, BEN.userId)).toMatchObject({ ok: true });
    tick(9_999);
    expect(await invite(ana, BEN.userId)).toMatchObject({ ok: false, error: expect.stringMatching(/Wait until/) });
    tick(1);
    expect(await invite(ana, BEN.userId)).toMatchObject({ ok: true });
    await settle();
    expect(ben.invites).toHaveLength(2);
  });

  it('only friends can be invited, only by the host with a valid sign-in, and only before the game', async () => {
    const { url } = await setUp();
    const ana = await present(url, 'token-ana');
    const ben = await present(url, 'token-ben');
    const cem = await present(url, 'token-cem');
    const code = await lobbyOf(ana, 'token-ana');

    // Cem is not Ana's friend
    expect(await invite(ana, CEM.userId)).toMatchObject({ error: 'You can only invite your friends' });
    // a made-up account id, and nonsense
    expect(await invite(ana, 'not-an-id')).toMatchObject({ error: 'That player does not exist' });
    expect(await ask((reply) => ana.socket.emit('invite', null as never, reply))).toMatchObject({ ok: false });
    // somebody else's token, or none
    expect(await invite(ana, BEN.userId, 'token-cem')).toMatchObject({ error: expect.stringMatching(/sign-in/) });
    expect(await invite(ana, BEN.userId, null)).toMatchObject({ error: expect.stringMatching(/sign-in/) });
    // yourself
    expect(await invite(ana, ANA.userId)).toMatchObject({ error: 'You are already in the lobby' });

    // a player who is not the host
    await ask((reply) => cem.socket.emit('join', { code, name: '', token: 'token-cem' }, reply));
    expect(await invite(cem, BEN.userId, 'token-cem')).toMatchObject({
      error: expect.stringMatching(/Only the player/),
    });

    // after the start
    await ask((reply) => ana.socket.emit('start', reply));
    expect(await invite(ana, BEN.userId)).toMatchObject({ error: 'The game has already started' });
    await settle();
    expect(ben.invites).toEqual([]);
    expect(cem.invites).toEqual([]);
  });

  it('a guest host cannot invite, and nobody can from outside a lobby', async () => {
    const { url } = await setUp();
    const guest = await connect(url);
    expect(await invite(guest, BEN.userId)).toMatchObject({ error: 'You are not in a lobby' });
    await lobbyOf(guest, null);
    expect(await invite(guest, BEN.userId)).toMatchObject({ error: 'Sign in to invite your friends' });
  });

  it('says so when the friend does not have the game open, or signed out, or the lobby is full', async () => {
    const { url } = await setUp();
    const ana = await present(url, 'token-ana');
    const code = await lobbyOf(ana, 'token-ana');
    expect(await invite(ana, BEN.userId)).toMatchObject({ error: 'Your friend does not have the game open right now' });

    // he opens the game, then signs out on it
    const ben = await present(url, 'token-ben');
    expect(await ask((reply) => ben.socket.emit('hello', { token: null }, reply))).toEqual({ ok: true });
    expect(await invite(ana, BEN.userId)).toMatchObject({
      error: expect.stringMatching(/does not have the game open/),
    });
    // and closes it after signing in again
    await ask((reply) => ben.socket.emit('hello', { token: 'token-ben' }, reply));
    ben.socket.disconnect();
    await settle();
    expect(await invite(ana, BEN.userId)).toMatchObject({
      error: expect.stringMatching(/does not have the game open/),
    });

    // a full lobby
    for (const name of ['Cem', 'Dea', 'Eli']) {
      const guest = await connect(url);
      await ask((reply) => guest.socket.emit('join', { code, name }, reply));
    }
    await present(url, 'token-ben');
    expect(await invite(ana, BEN.userId)).toMatchObject({ error: 'The lobby is full' });

    // a bad sign-in in hello is refused
    const stranger = await connect(url);
    expect(await ask((reply) => stranger.socket.emit('hello', { token: 'made-up' }, reply))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sign-in has expired/),
    });
  });

  it('without a friends check nobody can be invited', async () => {
    const url = await startServer({ verify: async (token) => accounts[token] ?? null });
    const ana = await present(url, 'token-ana');
    await present(url, 'token-ben');
    await lobbyOf(ana, 'token-ana');
    expect(await invite(ana, BEN.userId)).toMatchObject({ error: 'You can only invite your friends' });
  });
});

describe('nudging a friend about a new message', () => {
  const ANA = {
    userId: '00000000-0000-4000-8000-0000000000a1',
    username: 'AnaK',
    publicId: '11111111',
    avatarUrl: null,
  };
  const BEN = {
    userId: '00000000-0000-4000-8000-0000000000b1',
    username: 'BenM',
    publicId: '22222222',
    avatarUrl: null,
  };
  const CEM = {
    userId: '00000000-0000-4000-8000-0000000000c1',
    username: 'CemB',
    publicId: '33333333',
    avatarUrl: null,
  };
  const accounts: Record<string, typeof ANA> = { 'token-ana': ANA, 'token-ben': BEN, 'token-cem': CEM };
  const friendsOf: Record<string, string[]> = { [ANA.userId]: [BEN.userId], [BEN.userId]: [ANA.userId] };

  async function setUp() {
    let clock = 5_000_000;
    const url = await startServer({
      verify: async (token) => accounts[token] ?? null,
      areFriends: async (token, userId) => (friendsOf[accounts[token]?.userId ?? ''] ?? []).includes(userId),
      now: () => clock,
    });
    return { url, tick: (ms: number) => (clock += ms) };
  }
  async function present(url: string, token: string) {
    const player = await connect(url);
    const news: unknown[] = [];
    player.socket.on('news', (n) => news.push(n));
    await ask((reply) => player.socket.emit('hello', { token }, reply));
    return { ...player, news };
  }
  const poke = (player: { socket: Client }, to: string, token: string | null = 'token-ana') =>
    ask((reply) => player.socket.emit('poke', { to, token }, reply));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("reaches all the friend's open apps, and the sender's other apps, but not the sending one", async () => {
    const { url } = await setUp();
    const anaPhone = await present(url, 'token-ana');
    const anaLaptop = await present(url, 'token-ana');
    const ben = await present(url, 'token-ben');
    expect(await poke(anaPhone, BEN.userId)).toEqual({ ok: true });
    await settle();
    expect(ben.news).toEqual([{ with: ANA.userId }]);
    expect(anaLaptop.news).toEqual([{ with: BEN.userId }]);
    expect(anaPhone.news).toEqual([]);
  });

  it('only between friends, with a valid sign-in, about a real account', async () => {
    const { url } = await setUp();
    const ana = await present(url, 'token-ana');
    const cem = await present(url, 'token-cem');
    expect(await poke(ana, CEM.userId)).toMatchObject({ ok: false, error: 'You can only write to your friends' });
    expect(await poke(ana, BEN.userId, 'token-nobody')).toMatchObject({ error: expect.stringMatching(/sign-in/) });
    expect(await poke(ana, BEN.userId, null)).toMatchObject({ error: expect.stringMatching(/sign-in/) });
    expect(await poke(ana, 'not-an-id')).toMatchObject({ error: 'That player does not exist' });
    expect(await ask((reply) => ana.socket.emit('poke', null as never, reply))).toMatchObject({ ok: false });
    await settle();
    expect(cem.news).toEqual([]);
    const lonely = await startServer({ verify: async (token) => accounts[token] ?? null });
    const alone = await present(lonely, 'token-ana');
    expect(await poke(alone, BEN.userId)).toMatchObject({ error: 'You can only write to your friends' });
  });

  it('more than 30 pokes a minute from one app are let through quietly but not passed on', async () => {
    const { url, tick } = await setUp();
    const ana = await present(url, 'token-ana');
    const ben = await present(url, 'token-ben');
    for (let i = 0; i < 32; i++) expect(await poke(ana, BEN.userId)).toEqual({ ok: true });
    await settle();
    expect(ben.news).toHaveLength(30);
    tick(60_001);
    await poke(ana, BEN.userId);
    await settle();
    expect(ben.news).toHaveLength(31);
  });
});
