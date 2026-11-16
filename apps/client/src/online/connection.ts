/**
 * The app's line to the game server. One connection for the whole app, kept outside the
 * screens so that moving between them (lobby, table) never drops it.
 *
 * It remembers which lobby you are in and your key to it, so a lost connection, or a page
 * reloaded by accident, puts you back in your seat.
 */
import { io } from 'socket.io-client';
import type { Ack, ClientToServerEvents, GameAction, LobbySettings, LobbyState } from '@gur/server/protocol';
import { account } from '@/account';
import { serverUrl } from './config';

/** 'idle': not in use. 'connecting': first contact. 'online': connected. 'offline': lost, trying again. */
export type OnlineStatus = 'idle' | 'connecting' | 'online' | 'offline';

export type OnlineSnapshot = {
  status: OnlineStatus;
  /** The lobby you are in, as the server last described it; null when you are in none. */
  lobby: LobbyState | null;
  /** Server clock minus this device's clock, in milliseconds: countdowns use it. */
  clockOffset: number;
  /** Why you are no longer in your lobby, when the server said so. */
  notice: string | null;
};

type Session = { code: string; memberId: string };

/** The part of a Socket.IO socket this file uses: tests put a stand-in here. */
export interface SocketLike {
  connected: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each event has its own arguments
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
  disconnect: () => unknown;
}

/** Where the session is kept between visits. The browser's storage on the web; memory elsewhere. */
export interface SessionStore {
  get: (key: string) => string | null;
  set: (key: string, value: string | null) => void;
}

const memory = new Map<string, string>();
export const defaultStore: SessionStore = {
  get: (key) => {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch {
      // Private browsing can refuse storage: fall back to memory.
    }
    return memory.get(key) ?? null;
  },
  set: (key, value) => {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    try {
      if (typeof localStorage === 'undefined') return;
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Kept in memory only.
    }
  },
};

const SESSION_KEY = 'gur.session';
const NAME_KEY = 'gur.name';
/** A sleeping server takes about a minute to wake, so requests wait longer than that. */
const ANSWER_TIMEOUT_MS = 90_000;
const NO_ANSWER = 'The server did not answer. Check your connection and try again';

export class Connection {
  private socket: SocketLike | null = null;
  private session: Session | null = null;
  private snapshot: OnlineSnapshot = { status: 'idle', lobby: null, clockOffset: 0, notice: null };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly connect: () => SocketLike = () =>
      io(serverUrl(), { transports: ['websocket'] }) as unknown as SocketLike,
    private readonly store: SessionStore = defaultStore,
    private readonly now: () => number = Date.now,
    /** The sign-in token of a player with an account, or null for a guest. */
    private readonly getToken: () => Promise<string | null> = async () => null,
  ) {}

  // ---------- for screens ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): OnlineSnapshot => this.snapshot;

  /** The name you last played under, to fill the name box. */
  savedName(): string {
    return this.store.get(NAME_KEY) ?? '';
  }

  /** Whether there is a lobby from an earlier visit to go back to. */
  hasSavedSession(): boolean {
    return this.readSession() !== null;
  }

  // ---------- lobbies ----------

  async create(name: string, settings?: Partial<LobbySettings>): Promise<Ack<{ code: string }>> {
    this.store.set(NAME_KEY, name.trim());
    const answer = await this.request<{ code: string; memberId: string }>(
      'create',
      await this.signed({ name, settings }),
    );
    if (answer.ok) this.keep({ code: answer.code, memberId: answer.memberId });
    return answer;
  }

  async join(code: string, name: string): Promise<Ack<{ code: string }>> {
    this.store.set(NAME_KEY, name.trim());
    const answer = await this.request<{ code: string; memberId: string }>('join', await this.signed({ code, name }));
    if (answer.ok) this.keep({ code: answer.code, memberId: answer.memberId });
    return answer;
  }

  /** Goes back into the lobby from an earlier visit, if it is still there. */
  async resume(): Promise<boolean> {
    const session = this.readSession();
    if (!session) return false;
    this.session = session;
    const answer = await this.request('rejoin', session);
    if (!answer.ok) this.forget(null);
    return answer.ok;
  }

  settings(change: Partial<LobbySettings>): Promise<Ack> {
    return this.request('settings', change);
  }

  start(): Promise<Ack> {
    return this.request('start');
  }

  next(): Promise<Ack> {
    return this.request('next');
  }

  act(action: GameAction): Promise<Ack> {
    return this.request('action', action);
  }

  /** Leaves the lobby for good and hangs up. */
  async leave(): Promise<void> {
    if (this.socket?.connected) await this.request('leave');
    this.forget(null);
    this.socket?.disconnect();
    this.socket = null;
    this.update({ status: 'idle' });
  }

  // ---------- the line ----------

  private open(): SocketLike {
    if (this.socket) return this.socket;
    const socket = this.connect();
    this.socket = socket;
    this.update({ status: 'connecting' });

    socket.on('connect', () => {
      this.update({ status: 'online' });
      // Back after a dropped connection: take the seat again.
      const session = this.session;
      if (session && this.snapshot.lobby) {
        socket.emit('rejoin', session, (answer: Ack) => {
          if (!answer.ok && this.session === session) this.forget('You are no longer in that lobby');
        });
      }
    });
    socket.on('disconnect', () => {
      if (this.socket === socket) this.update({ status: 'offline' });
    });
    socket.on('state', (lobby: LobbyState) => {
      this.update({ lobby, clockOffset: lobby.now - this.now(), notice: null });
    });
    return socket;
  }

  /** Sends a request and waits for the server's answer. Never throws: no answer is an answer too. */
  private request<T = unknown>(event: keyof ClientToServerEvents, payload?: unknown): Promise<Ack<T>> {
    const socket = this.open();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: NO_ANSWER }), ANSWER_TIMEOUT_MS);
      const reply = (answer: Ack<T>) => {
        clearTimeout(timer);
        resolve(answer);
      };
      if (payload === undefined) socket.emit(event, reply);
      else socket.emit(event, payload, reply);
    });
  }

  /**
   * Adds the sign-in token of a player with an account, so the server knows who they are.
   * The line is opened first: looking the token up can take a moment, and the server may be waking.
   */
  private async signed<T extends object>(payload: T): Promise<T & { token?: string }> {
    this.open();
    const token = await this.getToken().catch(() => null);
    return token ? { ...payload, token } : payload;
  }

  private keep(session: Session): void {
    this.session = session;
    this.store.set(SESSION_KEY, JSON.stringify(session));
  }

  private forget(notice: string | null): void {
    this.session = null;
    this.store.set(SESSION_KEY, null);
    this.update({ lobby: null, notice });
  }

  private readSession(): Session | null {
    try {
      const saved = JSON.parse(this.store.get(SESSION_KEY) ?? 'null') as Partial<Session> | null;
      return saved && typeof saved.code === 'string' && typeof saved.memberId === 'string'
        ? { code: saved.code, memberId: saved.memberId }
        : null;
    } catch {
      return null;
    }
  }

  private update(change: Partial<OnlineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}

/** The app's one connection. A signed-in player's token goes along when they open or join a lobby. */
export const online = new Connection(undefined, undefined, undefined, () => account.token());
