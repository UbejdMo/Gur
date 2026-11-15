/** All the lobbies on this server, found by their code. */
import { randomUUID } from 'node:crypto';
import type { Rng } from '@gur/engine';
import { Lobby, LobbyError, realScheduler } from './lobby';
import type { LobbyConfig, Scheduler } from './lobby';

/** Letters and digits that are hard to mix up when read aloud or typed: no O/0, no I/1/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export interface LobbiesConfig {
  rng?: Rng;
  scheduler?: Scheduler;
  /** The most lobbies kept at once; a new one is refused beyond that. */
  maxLobbies?: number;
  /** A lobby with no connected player is thrown away after this long. */
  emptyTtlMs?: number;
  /** Passed on to every lobby (bot speed and other timings). */
  lobby?: Pick<LobbyConfig, 'botDelayMs' | 'awayDelayMs' | 'nextRoundDelayMs'>;
  /** Called when a lobby changed, so its players can be sent the new state. */
  onChange: (lobby: Lobby) => void;
}

/** What players type is forgiving: spaces and lower case are fine. */
export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : '';
}

export class Lobbies {
  private readonly byCode = new Map<string, Lobby>();
  private readonly rng: Rng;
  private readonly scheduler: Scheduler;
  private readonly maxLobbies: number;
  private readonly emptyTtlMs: number;

  constructor(private readonly config: LobbiesConfig) {
    this.rng = config.rng ?? Math.random;
    this.scheduler = config.scheduler ?? realScheduler;
    this.maxLobbies = config.maxLobbies ?? 500;
    this.emptyTtlMs = config.emptyTtlMs ?? 10 * 60_000;
  }

  get size(): number {
    return this.byCode.size;
  }

  create(): Lobby {
    this.sweep();
    if (this.byCode.size >= this.maxLobbies)
      throw new LobbyError('The server is full right now. Please try again later');
    const code = this.freeCode();
    const lobby: Lobby = new Lobby({
      ...this.config.lobby,
      code,
      rng: this.rng,
      scheduler: this.scheduler,
      newId: randomUUID,
      onChange: () => this.changed(lobby),
    });
    this.byCode.set(code, lobby);
    return lobby;
  }

  find(rawCode: unknown): Lobby {
    const lobby = this.byCode.get(normalizeCode(rawCode));
    if (!lobby) throw new LobbyError('No lobby has that code. Check it and try again');
    return lobby;
  }

  /** Throws away lobbies everybody left, and lobbies nobody has been connected to for a long time. */
  sweep(): void {
    for (const lobby of [...this.byCode.values()]) {
      if (lobby.abandoned || lobby.emptyFor() >= this.emptyTtlMs) this.remove(lobby);
    }
  }

  /** Stops every lobby's clock: for shutting the server down. */
  dispose(): void {
    for (const lobby of [...this.byCode.values()]) this.remove(lobby);
  }

  private changed(lobby: Lobby): void {
    // A lobby still being built (its first player is joining) is not in the map yet.
    if (!this.byCode.has(lobby.code)) return;
    if (lobby.abandoned) this.remove(lobby);
    else this.config.onChange(lobby);
  }

  private remove(lobby: Lobby): void {
    lobby.dispose();
    this.byCode.delete(lobby.code);
  }

  private freeCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
  }
}
