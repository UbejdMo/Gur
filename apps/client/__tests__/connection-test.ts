import type { Ack, LobbyState } from '@gur/server/protocol';
import { Connection } from '@/online/connection';
import type { SessionStore, SocketLike } from '@/online/connection';

/** A stand-in for the socket: records what is sent and lets the test answer as the server. */
class FakeSocket implements SocketLike {
  connected = false;
  sent: { event: string; payload: unknown; reply: (answer: Ack<Record<string, unknown>>) => void }[] = [];
  private handlers = new Map<string, (...args: unknown[]) => void>();

  on(event: string, listener: (...args: unknown[]) => void) {
    this.handlers.set(event, listener);
  }
  emit(event: string, ...args: unknown[]) {
    const reply = args.pop() as (answer: Ack<Record<string, unknown>>) => void;
    this.sent.push({ event, payload: args[0], reply });
  }
  disconnect() {
    this.connected = false;
  }
  /** The server side: fire an event at the app. */
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    this.handlers.get(event)?.(...args);
  }
  last(event: string) {
    return this.sent.filter((s) => s.event === event).at(-1)!;
  }
}

function memoryStore(initial: Record<string, string> = {}): SessionStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void (value === null ? data.delete(key) : data.set(key, value)),
  };
}

const lobbyState = (over: Partial<LobbyState> = {}): LobbyState => ({
  code: 'ABCDE',
  you: 0,
  members: [{ name: 'Ana', bot: false, connected: true, host: true, avatarUrl: null, publicId: null }],
  settings: { aceHigh: true, rounds: 1, fillWithBots: false },
  game: null,
  turnEndsAt: null,
  nextRoundAt: null,
  now: 50_000,
  ...over,
});

/** Lets the connection finish looking up the sign-in token, which it does before it sends. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup(saved: Record<string, string> = {}, getToken?: () => Promise<string | null>) {
  const socket = new FakeSocket();
  const store = memoryStore(saved);
  const connection = new Connection(
    () => socket,
    store,
    () => 49_000,
    getToken,
  );
  const seen: string[] = [];
  connection.subscribe(() => seen.push(connection.get().status));
  return { socket, store, connection, seen };
}

describe('the connection to the game server', () => {
  it('opens a lobby, remembers the key to it, and follows the state the server sends', async () => {
    const { socket, store, connection } = setup();
    expect(connection.get()).toMatchObject({ status: 'idle', lobby: null });
    const asked = connection.create('  Ana ', { rounds: 3 });
    expect(connection.get().status).toBe('connecting');
    socket.fire('connect');
    await settle();
    expect(connection.get().status).toBe('online');
    expect(socket.last('create').payload).toEqual({ name: '  Ana ', settings: { rounds: 3 } });
    socket.last('create').reply({ ok: true, code: 'ABCDE', memberId: 'key-1' });
    expect(await asked).toMatchObject({ ok: true, code: 'ABCDE' });
    expect(JSON.parse(store.data.get('gur.session')!)).toEqual({ code: 'ABCDE', memberId: 'key-1' });
    expect(connection.savedName()).toBe('Ana');
    expect(connection.hasSavedSession()).toBe(true);

    socket.fire('state', lobbyState());
    expect(connection.get().lobby?.code).toBe('ABCDE');
    // the server's clock is a second ahead of this device's
    expect(connection.get().clockOffset).toBe(1_000);
  });

  it('passes a refusal on, and keeps no key for a lobby it did not get into', async () => {
    const { socket, store, connection } = setup();
    const asked = connection.join('zzzzz', 'Ben');
    socket.fire('connect');
    await settle();
    socket.last('join').reply({ ok: false, error: 'No lobby has that code. Check it and try again' });
    expect(await asked).toEqual({ ok: false, error: 'No lobby has that code. Check it and try again' });
    expect(store.data.has('gur.session')).toBe(false);
    expect(connection.hasSavedSession()).toBe(false);
  });

  it('sends the sign-in token of a player with an account, and none for a guest', async () => {
    const signedIn = setup({}, () => Promise.resolve('token-1'));
    void signedIn.connection.create('Ana');
    await settle();
    expect(signedIn.socket.last('create').payload).toEqual({ name: 'Ana', settings: undefined, token: 'token-1' });
    void signedIn.connection.join('ABCDE', 'Ana');
    await settle();
    expect(signedIn.socket.last('join').payload).toEqual({ code: 'ABCDE', name: 'Ana', token: 'token-1' });

    // a sign-in that cannot be read is no reason not to play: the player goes in as a guest
    const broken = setup({}, () => Promise.reject(new Error('storage is blocked')));
    void broken.connection.join('ABCDE', 'Ben');
    await settle();
    expect(broken.socket.last('join').payload).toEqual({ code: 'ABCDE', name: 'Ben' });
  });

  it('sends lobby and game requests as they are', async () => {
    const { socket, connection } = setup();
    socket.fire('connect');
    const requests = [
      connection.settings({ aceHigh: false }),
      connection.start(),
      connection.next(),
      connection.act({ type: 'draw', source: 'middle' }),
    ];
    expect(socket.sent.map((s) => [s.event, s.payload])).toEqual([
      ['settings', { aceHigh: false }],
      ['start', undefined],
      ['next', undefined],
      ['action', { type: 'draw', source: 'middle' }],
    ]);
    socket.sent.forEach((s) => s.reply({ ok: true }));
    expect(await Promise.all(requests)).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
  });

  it('takes the seat again by itself after a dropped connection', async () => {
    const { socket, connection, seen } = setup();
    const asked = connection.join('ABCDE', 'Ben');
    socket.fire('connect');
    await settle();
    socket.last('join').reply({ ok: true, code: 'ABCDE', memberId: 'key-2' });
    await asked;
    socket.fire('state', lobbyState());

    socket.fire('disconnect');
    expect(connection.get().status).toBe('offline');
    socket.fire('connect');
    expect(socket.last('rejoin').payload).toEqual({ code: 'ABCDE', memberId: 'key-2' });
    socket.last('rejoin').reply({ ok: true });
    expect(connection.get()).toMatchObject({ status: 'online', lobby: { code: 'ABCDE' } });
    expect(seen).toContain('offline');
  });

  it('says so when the lobby is gone by the time the connection is back', async () => {
    const { socket, store, connection } = setup();
    const asked = connection.join('ABCDE', 'Ben');
    socket.fire('connect');
    await settle();
    socket.last('join').reply({ ok: true, code: 'ABCDE', memberId: 'key-2' });
    await asked;
    socket.fire('state', lobbyState());
    socket.fire('disconnect');
    socket.fire('connect');
    socket.last('rejoin').reply({ ok: false, error: 'You are no longer in that lobby' });
    expect(connection.get()).toMatchObject({ lobby: null, notice: 'You are no longer in that lobby' });
    expect(store.data.has('gur.session')).toBe(false);
  });

  it('goes back into the lobby from an earlier visit, if it is still there', async () => {
    const saved = { 'gur.session': JSON.stringify({ code: 'ABCDE', memberId: 'key-9' }), 'gur.name': 'Ana' };
    const here = setup(saved);
    expect(here.connection.savedName()).toBe('Ana');
    const back = here.connection.resume();
    here.socket.fire('connect');
    expect(here.socket.sent.filter((s) => s.event === 'rejoin')).toHaveLength(1);
    here.socket.last('rejoin').reply({ ok: true });
    expect(await back).toBe(true);

    const gone = setup(saved);
    const tried = gone.connection.resume();
    gone.socket.fire('connect');
    gone.socket.last('rejoin').reply({ ok: false, error: 'No lobby has that code' });
    expect(await tried).toBe(false);
    expect(gone.connection.hasSavedSession()).toBe(false);

    // nothing saved, or something unreadable: nothing to go back to, and nothing is sent
    const unusable: Record<string, string>[] = [{}, { 'gur.session': 'not json' }, { 'gur.session': '{"code":5}' }];
    for (const bad of unusable) {
      const none = setup(bad);
      expect(await none.connection.resume()).toBe(false);
      expect(none.socket.sent).toHaveLength(0);
    }
  });

  it('leaving tells the server, forgets the lobby and hangs up', async () => {
    const { socket, store, connection } = setup();
    const asked = connection.create('Ana');
    socket.fire('connect');
    await settle();
    socket.last('create').reply({ ok: true, code: 'ABCDE', memberId: 'key-1' });
    await asked;
    socket.fire('state', lobbyState());
    const left = connection.leave();
    socket.last('leave').reply({ ok: true });
    await left;
    expect(connection.get()).toMatchObject({ status: 'idle', lobby: null });
    expect(store.data.has('gur.session')).toBe(false);
    expect(socket.connected).toBe(false);
  });

  it('answers for a server that never does', async () => {
    jest.useFakeTimers();
    try {
      const { connection } = setup();
      const asked = connection.start();
      jest.advanceTimersByTime(90_000);
      expect(await asked).toEqual({ ok: false, error: expect.stringMatching(/did not answer/) });
    } finally {
      jest.useRealTimers();
    }
  });
});
