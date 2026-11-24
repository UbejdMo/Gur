/**
 * One lobby: the players waiting together, and their game once it starts.
 *
 * The lobby owns the whole game and is the only thing that changes it. Players send
 * intentions; each is checked against the rules by the engine, and a broken rule comes back
 * as a LobbyError with words for the player. The lobby also owns the clock: it plays the
 * timeout move when a turn runs out, plays for the bots, and starts the next round.
 *
 * Nothing here knows about the network. server.ts connects lobbies to sockets.
 */
import {
  RuleError,
  acceptRestart,
  arrange,
  botTurn,
  close,
  createGame,
  discard,
  draw,
  nextRound,
  playerView,
  timeoutMove,
  turnSeconds,
} from '@gur/engine';
import type { Game, Rng } from '@gur/engine';
import type { ChatLine, GameAction, LobbySettings, LobbyState } from './protocol';

/** Something a player asked for that the lobby refuses. The message is shown to that player. */
export class LobbyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LobbyError';
  }
}

/** The clock and timers, replaceable in tests. */
export interface Scheduler {
  now: () => number;
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface LobbyConfig {
  code: string;
  rng: Rng;
  scheduler: Scheduler;
  /** Makes the secret id each player keeps to get back into the lobby. */
  newId: () => string;
  /** Called after every change, so the new state can be sent to the players. */
  onChange: () => void;
  /** How long a bot takes over its turn: [shortest, longest] in milliseconds. */
  botDelayMs?: readonly [number, number];
  /** How long before the game plays for a player who has left. */
  awayDelayMs?: number;
  /** How long the results stay up before the next round starts by itself. */
  nextRoundDelayMs?: number;
  /** A public table ("Play online") for players who chose this about 12-13-1. Without it, a friends' lobby. */
  open?: { aceHigh: boolean };
  /** How long a public table waits for four players before it starts with the two or three who are there. */
  matchWaitMs?: number;
}

export const MAX_PLAYERS = 4;
/** The chat: the longest line, how many lines are kept, and how many a player may say in 10 seconds. */
export const MAX_CHAT_LENGTH = 200;
export const CHAT_KEPT = 50;
export const CHAT_PER_10S = 5;
export const MAX_NAME_LENGTH = 16;
/** A public table starts after this long with the players who are there, if there are at least two. */
export const MATCH_WAIT_MS = 30_000;
export const DEFAULT_SETTINGS: LobbySettings = { aceHigh: true, rounds: 1, fillWithBots: false };

/** A player whose sign-in the server has checked. */
export interface SignedInPlayer {
  userId: string;
  username: string;
  publicId: string;
  avatarUrl: string | null;
}

interface Member {
  /** Secret: only this player's app knows it. */
  id: string;
  name: string;
  /** Set for players with an account. */
  account?: SignedInPlayer;
  bot: boolean;
  connected: boolean;
  /** Walked away from a game in progress. Their seat stays and the game plays for them. */
  left: boolean;
  /** Names them in the chat; not secret. */
  chatId: string;
}

export class Lobby {
  readonly code: string;
  /** A public table: no leader, one round, no bots, and it starts by itself. */
  readonly isOpen: boolean;
  private members: Member[] = [];
  private hostId: string | null = null;
  private settings: LobbySettings = { ...DEFAULT_SETTINGS };
  private game: Game | null = null;

  private turnKey: string | null = null;
  private turnTimer: unknown = null;
  private turnEndsAt: number | null = null;
  private nextRoundTimer: unknown = null;
  private nextRoundAt: number | null = null;
  /** When the last connected player went away; null while somebody is here. */
  private emptySince: number | null;
  /** The chat, newest last, at most CHAT_KEPT lines. */
  private chat: ChatLine[] = [];
  private chatCount = 0;
  /** When each player last spoke, for the limit on how fast they may. */
  private spoke = new Map<string, number[]>();
  /** A public table still waiting: when it starts without waiting for a fourth. Null once that time has passed. */
  private startsAt: number | null = null;
  private waitTimer: unknown = null;

  private readonly botDelayMs: readonly [number, number];
  private readonly awayDelayMs: number;
  private readonly nextRoundDelayMs: number;

  constructor(private readonly config: LobbyConfig) {
    this.code = config.code;
    this.botDelayMs = config.botDelayMs ?? [1500, 4000];
    this.awayDelayMs = config.awayDelayMs ?? 1500;
    this.nextRoundDelayMs = config.nextRoundDelayMs ?? 12_000;
    this.emptySince = config.scheduler.now();
    this.isOpen = config.open !== undefined;
    if (config.open) {
      // No bots online: only people play at a public table.
      this.settings = { aceHigh: config.open.aceHigh, rounds: 1, fillWithBots: false };
      const wait = config.matchWaitMs ?? MATCH_WAIT_MS;
      this.startsAt = config.scheduler.now() + wait;
      this.waitTimer = config.scheduler.set(() => this.waitOver(), wait);
    }
  }

  // ---------- who is here ----------

  /**
   * A new player comes in. Returns their secret id. A signed-in player goes by the name on
   * their profile; a guest by the name they typed.
   */
  join(rawName: string, account?: SignedInPlayer): string {
    if (this.game) throw new LobbyError('This game has already started');
    if (this.members.length >= MAX_PLAYERS) throw new LobbyError('This lobby is full');
    const member: Member = {
      id: this.config.newId(),
      name: this.freeName(account ? account.username : cleanName(rawName)),
      account,
      bot: false,
      connected: true,
      left: false,
      chatId: this.config.newId(),
    };
    this.members.push(member);
    if (!this.isOpen) this.hostId ??= member.id;
    if (this.readyToStart()) this.begin();
    else this.changed();
    return member.id;
  }

  // ---------- a public table ----------

  /** Still waiting for players, before the game. */
  get waiting(): boolean {
    return this.game === null;
  }

  /** Whether 12-13-1 is allowed at this table. */
  get aceHigh(): boolean {
    return this.settings.aceHigh;
  }

  /** How many seats are taken. */
  get size(): number {
    return this.members.length;
  }

  /** How many players are here (connected) right now. */
  get here(): number {
    return this.humans().filter((m) => m.connected).length;
  }

  /** A public table starts when four players are here, or, once the wait is over, when two are. */
  private readyToStart(): boolean {
    if (!this.isOpen || this.game) return false;
    return this.here >= MAX_PLAYERS || (this.startsAt === null && this.here >= 2);
  }

  /** The wait at a public table is over: start if somebody else is here, or keep waiting. */
  private waitOver(): void {
    this.waitTimer = null;
    this.startsAt = null;
    if (this.game) return;
    if (this.readyToStart()) this.begin();
    else this.changed();
  }

  /**
   * Checks that the player may invite somebody with an account into this lobby now, and
   * returns their own account. Only the host can, only before the game, and only while
   * there is room. Throws LobbyError with the reason otherwise.
   */
  checkInvite(memberId: string, userId: string): SignedInPlayer {
    this.assertHost(memberId);
    const host = this.member(memberId);
    if (!host.account) throw new LobbyError('Sign in to invite your friends');
    if (this.game) throw new LobbyError('The game has already started');
    if (host.account.userId === userId) throw new LobbyError('You are already in the lobby');
    if (this.seatOfAccount(userId)) throw new LobbyError('Your friend is already in the lobby');
    if (this.members.length >= MAX_PLAYERS) throw new LobbyError('The lobby is full');
    return host.account;
  }

  /** The seat a signed-in player already has in this lobby (their secret id), or null. */
  seatOfAccount(userId: string): string | null {
    return this.humans().find((m) => m.account?.userId === userId)?.id ?? null;
  }

  has(memberId: string): boolean {
    return this.members.some((m) => m.id === memberId && !m.bot && !m.left);
  }

  /** The player's app connected or dropped. A dropped player keeps their seat. */
  setConnected(memberId: string, connected: boolean): void {
    const member = this.member(memberId);
    if (member.connected === connected) return;
    member.connected = connected;
    if (this.readyToStart()) this.begin();
    else this.changed();
  }

  /** The player goes for good. Before the game their place is freed; during it the game plays on for them. */
  leave(memberId: string): void {
    const member = this.member(memberId);
    if (this.game) {
      // If it was their turn, the game should not wait out their clock.
      if (this.game.round.current === this.members.indexOf(member)) this.turnKey = null;
      member.left = true;
      member.connected = false;
    } else {
      this.members = this.members.filter((m) => m !== member);
    }
    if (this.hostId === memberId) this.hostId = this.humans()[0]?.id ?? null;
    this.changed();
  }

  /** Nobody is left who could come back: the lobby can be thrown away. */
  get abandoned(): boolean {
    return this.humans().length === 0;
  }

  /** How long the lobby has had no connected player, in milliseconds. */
  emptyFor(): number {
    return this.emptySince === null ? 0 : this.config.scheduler.now() - this.emptySince;
  }

  /** The secret ids of the players to send state to. */
  memberIds(): string[] {
    return this.humans().map((m) => m.id);
  }

  // ---------- before the game ----------

  setSettings(memberId: string, change: Partial<LobbySettings>): void {
    this.assertHost(memberId);
    if (this.game) throw new LobbyError('The options cannot change during a game');
    const next = { ...this.settings };
    if (change.aceHigh !== undefined) {
      if (typeof change.aceHigh !== 'boolean') throw new LobbyError('That option is not valid');
      next.aceHigh = change.aceHigh;
    }
    if (change.fillWithBots !== undefined) {
      if (typeof change.fillWithBots !== 'boolean') throw new LobbyError('That option is not valid');
      next.fillWithBots = change.fillWithBots;
    }
    if (change.rounds !== undefined) {
      if (![1, 3, 5].includes(change.rounds)) throw new LobbyError('A match has 1, 3 or 5 rounds');
      next.rounds = change.rounds;
    }
    this.settings = next;
    this.changed();
  }

  start(memberId: string): void {
    this.assertHost(memberId);
    if (this.game) throw new LobbyError('This game has already started');
    this.begin();
  }

  /** Seats the players (and bots) and deals. At a public table, players who are not here lose their seat. */
  private begin(): void {
    this.clearWaitTimer();
    this.startsAt = null;
    if (this.isOpen) this.members = this.members.filter((m) => m.connected);
    const seats = [...this.members];
    if (this.settings.fillWithBots) {
      for (let n = 1; seats.length < MAX_PLAYERS; n++) {
        seats.push({
          id: this.config.newId(),
          name: this.freeName(`Bot ${n}`, seats),
          bot: true,
          connected: true,
          left: false,
          chatId: this.config.newId(),
        });
      }
    }
    if (seats.length < 2) throw new LobbyError('You need at least 2 players. Invite a friend, or turn on bots');
    this.members = seats;
    this.game = createGame(
      { aceHigh: this.settings.aceHigh, rounds: this.settings.rounds },
      seats.map((m) => m.name),
      this.config.rng,
    );
    this.changed();
  }

  // ---------- during the game ----------

  /** A player's move. The engine decides whether it is allowed. */
  act(memberId: string, action: GameAction): void {
    const seat = this.seatOf(memberId);
    const game = this.playing();
    try {
      this.game = applyAction(game, seat, action, this.config.rng);
    } catch (e) {
      if (e instanceof RuleError) throw new LobbyError(e.message);
      throw e;
    }
    this.changed();
  }

  /** Host only: the next round now, or back to the lobby once the match is over. */
  next(memberId: string): void {
    this.assertHost(memberId);
    if (!this.game || this.game.status === 'playing') throw new LobbyError('The round is still being played');
    if (this.game.status === 'roundOver') {
      this.game = nextRound(this.game, this.config.rng);
    } else {
      this.game = null;
      this.members = this.humans().map((m) => ({ ...m, left: false }));
    }
    this.changed();
  }

  // ---------- what a player sees ----------

  stateFor(memberId: string): LobbyState {
    const you = this.members.findIndex((m) => m.id === memberId);
    if (you === -1) throw new LobbyError('You are not in this lobby');
    return {
      code: this.code,
      kind: this.isOpen ? 'public' : 'friends',
      startsAt: this.startsAt,
      you,
      members: this.members.map((m) => ({
        name: m.name,
        bot: m.bot,
        connected: m.connected && !m.left,
        host: m.id === this.hostId,
        avatarUrl: m.account?.avatarUrl ?? null,
        publicId: m.account?.publicId ?? null,
        chatId: m.chatId,
      })),
      settings: { ...this.settings },
      game: this.game ? playerView(this.game, you) : null,
      turnEndsAt: this.turnEndsAt,
      nextRoundAt: this.nextRoundAt,
      now: this.config.scheduler.now(),
    };
  }

  // ---------- the chat ----------

  /**
   * Checks what a player wants to say, and returns it tidied up: one line, no more than
   * MAX_CHAT_LENGTH characters, at most CHAT_PER_10S lines in 10 seconds. Throws LobbyError.
   */
  checkSay(memberId: string, raw: unknown): string {
    this.member(memberId);
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new LobbyError('Type something first');
    if ([...text].length > MAX_CHAT_LENGTH) throw new LobbyError(`Keep it under ${MAX_CHAT_LENGTH} characters`);
    const now = this.config.scheduler.now();
    const recent = (this.spoke.get(memberId) ?? []).filter((at) => at > now - 10_000);
    if (recent.length >= CHAT_PER_10S) throw new LobbyError('Slow down a little');
    return text;
  }

  /** Adds a line to the chat (checked with checkSay first) and returns it. */
  say(memberId: string, text: string): ChatLine {
    const member = this.member(memberId);
    const now = this.config.scheduler.now();
    this.spoke.set(memberId, [...(this.spoke.get(memberId) ?? []).filter((at) => at > now - 10_000), now]);
    const line: ChatLine = {
      id: ++this.chatCount,
      from: member.chatId,
      seat: this.members.indexOf(member),
      name: member.name,
      text,
      at: now,
    };
    this.chat = [...this.chat, line].slice(-CHAT_KEPT);
    return line;
  }

  /** The chat so far, oldest first. */
  chatHistory(): ChatLine[] {
    return [...this.chat];
  }

  /**
   * Who a chat id belongs to, for a report: their account (null for a guest or a bot), and
   * the last 20 things they said here.
   */
  chatAuthor(chatId: string): { account: SignedInPlayer | null; said: string[] } {
    const member = this.members.find((m) => m.chatId === chatId);
    if (!member) throw new LobbyError('That player is not at this table');
    return {
      account: member.account ?? null,
      said: this.chat
        .filter((l) => l.from === chatId)
        .slice(-20)
        .map((l) => l.text),
    };
  }

  /** Stops the clocks. Call before throwing the lobby away. */
  dispose(): void {
    this.clearTurnTimer();
    this.clearNextRoundTimer();
    this.clearWaitTimer();
  }

  // ---------- the clock ----------

  /** After every change: keep the timers right and tell the players. */
  private changed(): void {
    const present = this.humans().some((m) => m.connected);
    if (present) this.emptySince = null;
    else this.emptySince ??= this.config.scheduler.now();
    this.schedule();
    this.config.onChange();
  }

  private schedule(): void {
    const game = this.game;
    if (!game || game.status !== 'playing') {
      this.clearTurnTimer();
      this.turnKey = null;
    } else {
      // A turn keeps its clock when the player draws or moves tiles: only a new turn restarts it.
      const key = `${game.round.number}:${game.round.turn}:${game.round.current}`;
      if (key !== this.turnKey) {
        this.clearTurnTimer();
        this.turnKey = key;
        const member = this.members[game.round.current]!;
        if (member.bot) {
          const [min, max] = this.botDelayMs;
          this.turnTimer = this.config.scheduler.set(
            () => this.autoPlay(botTurn),
            min + this.config.rng() * (max - min),
          );
        } else if (member.left) {
          this.turnTimer = this.config.scheduler.set(() => this.autoPlay(timeoutMove), this.awayDelayMs);
        } else {
          const ms = turnSeconds(game) * 1000;
          this.turnEndsAt = this.config.scheduler.now() + ms;
          this.turnTimer = this.config.scheduler.set(() => this.autoPlay(timeoutMove), ms);
        }
      }
    }

    if (game?.status === 'roundOver') {
      if (this.nextRoundTimer === null) {
        this.nextRoundAt = this.config.scheduler.now() + this.nextRoundDelayMs;
        this.nextRoundTimer = this.config.scheduler.set(() => {
          this.nextRoundTimer = null;
          this.nextRoundAt = null;
          if (this.game?.status !== 'roundOver') return;
          this.game = nextRound(this.game, this.config.rng);
          this.changed();
        }, this.nextRoundDelayMs);
      }
    } else {
      this.clearNextRoundTimer();
    }
  }

  /** A move the game makes itself: a bot's turn, or the timeout move for a player out of time. */
  private autoPlay(move: (game: Game) => Game): void {
    this.turnTimer = null;
    this.turnEndsAt = null;
    if (!this.game || this.game.status !== 'playing') return;
    this.game = move(this.game);
    this.changed();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) this.config.scheduler.clear(this.turnTimer);
    this.turnTimer = null;
    this.turnEndsAt = null;
  }

  private clearWaitTimer(): void {
    if (this.waitTimer !== null) this.config.scheduler.clear(this.waitTimer);
    this.waitTimer = null;
  }

  private clearNextRoundTimer(): void {
    if (this.nextRoundTimer !== null) this.config.scheduler.clear(this.nextRoundTimer);
    this.nextRoundTimer = null;
    this.nextRoundAt = null;
  }

  // ---------- helpers ----------

  private humans(): Member[] {
    return this.members.filter((m) => !m.bot && !m.left);
  }

  private member(memberId: string): Member {
    const member = this.members.find((m) => m.id === memberId && !m.bot && !m.left);
    if (!member) throw new LobbyError('You are not in this lobby');
    return member;
  }

  private seatOf(memberId: string): number {
    return this.members.indexOf(this.member(memberId));
  }

  private playing(): Game {
    if (!this.game) throw new LobbyError('The game has not started yet');
    return this.game;
  }

  private assertHost(memberId: string): void {
    this.member(memberId);
    if (this.isOpen) throw new LobbyError('This table starts by itself');
    if (memberId !== this.hostId) throw new LobbyError('Only the player who created the lobby can do that');
  }

  /** Two players never share a name: the second "Ana" becomes "Ana 2". */
  private freeName(name: string, taken: readonly Member[] = this.members): string {
    const used = new Set(taken.map((m) => m.name.toLowerCase()));
    if (!used.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, MAX_NAME_LENGTH - 2)} ${n}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }
}

/** Trims a name, squeezes its spaces, and cuts it to length. An empty name is refused. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new LobbyError('Please choose a name');
  // Letters, digits, spaces and a few marks from any alphabet; nothing that could pose as markup.
  const name = raw
    .replace(/[^\p{L}\p{N} ._'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  if (!name) throw new LobbyError('Please choose a name');
  return name;
}

const isTile = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 106;

/** Checks the shape of what came over the network, then lets the engine apply the rules. */
function applyAction(game: Game, seat: number, action: GameAction, rng: Rng): Game {
  if (typeof action !== 'object' || action === null) throw new LobbyError('That move is not valid');
  switch (action.type) {
    case 'arrange':
      if (!Array.isArray(action.groups) || !action.groups.every((g) => Array.isArray(g) && g.every(isTile))) {
        throw new LobbyError('That move is not valid');
      }
      return arrange(game, seat, action.groups);
    case 'draw':
      if (!['middle', 'discard', 'indicator'].includes(action.source)) throw new LobbyError('That move is not valid');
      return draw(game, seat, action.source);
    case 'discard':
      if (!isTile(action.tile)) throw new LobbyError('That move is not valid');
      return discard(game, seat, action.tile);
    case 'close':
      if (!isTile(action.tile)) throw new LobbyError('That move is not valid');
      return close(game, seat, action.tile);
    case 'acceptRestart':
      return acceptRestart(game, seat, rng);
    default:
      throw new LobbyError('That move is not valid');
  }
}
