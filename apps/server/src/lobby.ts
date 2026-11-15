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
import type { GameAction, LobbySettings, LobbyState } from './protocol';

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
}

export const MAX_PLAYERS = 4;
export const MAX_NAME_LENGTH = 16;
export const DEFAULT_SETTINGS: LobbySettings = { aceHigh: true, rounds: 1, fillWithBots: false };

interface Member {
  /** Secret: only this player's app knows it. */
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  /** Walked away from a game in progress. Their seat stays and the game plays for them. */
  left: boolean;
}

export class Lobby {
  readonly code: string;
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

  private readonly botDelayMs: readonly [number, number];
  private readonly awayDelayMs: number;
  private readonly nextRoundDelayMs: number;

  constructor(private readonly config: LobbyConfig) {
    this.code = config.code;
    this.botDelayMs = config.botDelayMs ?? [1500, 4000];
    this.awayDelayMs = config.awayDelayMs ?? 1500;
    this.nextRoundDelayMs = config.nextRoundDelayMs ?? 12_000;
    this.emptySince = config.scheduler.now();
  }

  // ---------- who is here ----------

  /** A new player comes in. Returns their secret id. */
  join(rawName: string): string {
    if (this.game) throw new LobbyError('This game has already started');
    if (this.members.length >= MAX_PLAYERS) throw new LobbyError('This lobby is full');
    const member: Member = {
      id: this.config.newId(),
      name: this.freeName(cleanName(rawName)),
      bot: false,
      connected: true,
      left: false,
    };
    this.members.push(member);
    this.hostId ??= member.id;
    this.changed();
    return member.id;
  }

  has(memberId: string): boolean {
    return this.members.some((m) => m.id === memberId && !m.bot && !m.left);
  }

  /** The player's app connected or dropped. A dropped player keeps their seat. */
  setConnected(memberId: string, connected: boolean): void {
    const member = this.member(memberId);
    if (member.connected === connected) return;
    member.connected = connected;
    this.changed();
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
    const seats = [...this.members];
    if (this.settings.fillWithBots) {
      for (let n = 1; seats.length < MAX_PLAYERS; n++) {
        seats.push({
          id: this.config.newId(),
          name: this.freeName(`Bot ${n}`, seats),
          bot: true,
          connected: true,
          left: false,
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
      you,
      members: this.members.map((m) => ({
        name: m.name,
        bot: m.bot,
        connected: m.connected && !m.left,
        host: m.id === this.hostId,
      })),
      settings: { ...this.settings },
      game: this.game ? playerView(this.game, you) : null,
      turnEndsAt: this.turnEndsAt,
      nextRoundAt: this.nextRoundAt,
      now: this.config.scheduler.now(),
    };
  }

  /** Stops the clocks. Call before throwing the lobby away. */
  dispose(): void {
    this.clearTurnTimer();
    this.clearNextRoundTimer();
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
