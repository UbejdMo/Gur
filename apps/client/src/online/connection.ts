/**
 * The app's line to the game server. One connection for the whole app, kept outside the
 * screens so that moving between them (lobby, table) never drops it.
 *
 * It remembers which lobby you are in and your key to it, so a lost connection, or a page
 * reloaded by accident, puts you back in your seat.
 *
 * A signed-in player stays connected while the app is open ("present"), so friends can
 * invite them into a lobby; a guest is only connected while in a lobby.
 */
import { io } from 'socket.io-client';
import type {
  Ack,
  ChatLine,
  ClientToServerEvents,
  GameAction,
  Invite,
  LobbySettings,
  LobbyState,
  News,
} from '@gur/server/protocol';
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
  /** The chat at your table, oldest first. */
  chat: readonly TableLine[];
};

/** A chat line as the app keeps it: `fresh` lines were said while you were there (they pop up over the seat). */
export type TableLine = ChatLine & { fresh: boolean };

const CHAT_KEPT = 50;

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
  private snapshot: OnlineSnapshot = { status: 'idle', lobby: null, clockOffset: 0, notice: null, chat: [] };
  private readonly listeners = new Set<() => void>();
  private readonly inviteListeners = new Set<(invite: Invite) => void>();
  private readonly newsListeners = new Set<(news: News) => void>();
  /** Signed in with the app open: the server knows, so friends can invite you. */
  private present = false;
  /** The server has been told who you are on the current connection. */
  private greeted = false;

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

  /** Leaves the lobby for good. Hangs up too, unless friends should still be able to reach you. */
  async leave(): Promise<void> {
    if (this.socket?.connected) await this.request('leave');
    this.forget(null);
    if (!this.present) this.hangUp();
  }

  // ---------- friends ----------

  /**
   * Signed in (true) or not (false). While signed in the line stays open and the server is
   * told who you are, so friends can invite you; signing out tells it to forget that.
   */
  setPresent(present: boolean): void {
    if (present === this.present) return;
    this.present = present;
    if (present) {
      void this.hello();
    } else if (this.socket) {
      this.greeted = false;
      if (this.socket.connected) this.socket.emit('hello', { token: null }, () => undefined);
      if (!this.session) this.hangUp();
    }
  }

  /** Calls `listener` with every invitation into a friend's lobby. Returns a way to stop. */
  onInvite(listener: (invite: Invite) => void): () => void {
    this.inviteListeners.add(listener);
    return () => this.inviteListeners.delete(listener);
  }

  /** Says something to everybody at your table: up to 200 characters, or one emoji. */
  async say(text: string): Promise<Ack> {
    return this.request('say', { text });
  }

  /** Reports a player at your table (their chat id). You need to be signed in, and so do they. */
  async report(chatId: string, why: string, note: string, alsoBlock: boolean): Promise<Ack> {
    return this.request('report', await this.signed({ chatId, why, note, alsoBlock }));
  }

  /** Calls `listener` whenever a conversation has something new. Returns a way to stop. */
  onNews(listener: (news: News) => void): () => void {
    this.newsListeners.add(listener);
    return () => this.newsListeners.delete(listener);
  }

  /** Tells the server you just wrote to a friend (their account id), so their apps show it at once. */
  async poke(to: string): Promise<Ack> {
    if (!this.present) return { ok: false, error: 'Sign in first' };
    return this.request('poke', await this.signed({ to }));
  }

  /** Host only: invites a friend (their account id) into your lobby. */
  async invite(userId: string): Promise<Ack<{ seconds: number }>> {
    return this.request<{ seconds: number }>('invite', await this.signed({ userId }));
  }

  // ---------- the line ----------

  private open(): SocketLike {
    if (this.socket) return this.socket;
    const socket = this.connect();
    this.socket = socket;
    this.update({ status: 'connecting' });

    socket.on('connect', () => {
      this.update({ status: 'online' });
      if (this.present) void this.hello();
      // Back after a dropped connection: take the seat again.
      const session = this.session;
      if (session && this.snapshot.lobby) {
        socket.emit('rejoin', session, (answer: Ack) => {
          if (!answer.ok && this.session === session) this.forget('You are no longer in that lobby');
        });
      }
    });
    socket.on('disconnect', () => {
      if (this.socket !== socket) return;
      this.greeted = false;
      this.update({ status: 'offline' });
    });
    socket.on('state', (lobby: LobbyState) => {
      this.update({ lobby, clockOffset: lobby.now - this.now(), notice: null });
    });
    socket.on('invited', (invite: Invite) => {
      for (const listener of [...this.inviteListeners]) listener(invite);
    });
    socket.on('chat', (update: { lines: ChatLine[]; reset?: boolean }) => {
      const incoming = (update.lines ?? []).map((line) => ({ ...line, fresh: !update.reset }));
      const known = update.reset ? [] : this.snapshot.chat;
      const byId = new Map<number, TableLine>();
      for (const line of [...known, ...incoming]) if (!byId.has(line.id) || !update.reset) byId.set(line.id, line);
      this.update({ chat: [...byId.values()].sort((a, b) => a.id - b.id).slice(-CHAT_KEPT) });
    });
    socket.on('news', (news: News) => {
      for (const listener of [...this.newsListeners]) listener(news);
    });
    return socket;
  }

  /** Tells the server who you are, so friends can reach you. Again after every reconnect. */
  private async hello(): Promise<void> {
    const socket = this.open();
    const token = await this.getToken().catch(() => null);
    if (!this.present || this.socket !== socket || !socket.connected || !token || this.greeted) return;
    this.greeted = true;
    socket.emit('hello', { token }, () => undefined);
  }

  private hangUp(): void {
    this.greeted = false;
    this.socket?.disconnect();
    this.socket = null;
    this.update({ status: 'idle' });
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
    this.update({ lobby: null, notice, chat: [] });
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
