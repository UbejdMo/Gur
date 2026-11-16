/**
 * What the app and the server say to each other. Types only: the app imports this file for
 * its types and nothing else from the server.
 *
 * The app sends intentions ("I draw from the middle"); the server checks them against the
 * rules and sends every player their own view of the result. A player never receives
 * another player's rack or the order of the middle.
 */
import type { PlayerView, TileId } from '@gur/engine';

export interface LobbySettings {
  /** 12-13-1 allowed. */
  aceHigh: boolean;
  /** How many rounds the match has. */
  rounds: 1 | 3 | 5;
  /** Empty seats are filled with bots when the game starts, up to four players. */
  fillWithBots: boolean;
}

export interface MemberView {
  name: string;
  bot: boolean;
  /** False while a player's app is not connected; the turn timer plays for them meanwhile. */
  connected: boolean;
  /** The player who created the lobby: they choose the options and start the game. */
  host: boolean;
  /** Signed-in players only: their picture and the eight-digit id friends can add them by. */
  avatarUrl: string | null;
  publicId: string | null;
}

/** Everything one player sees: the lobby, and their view of the game once it has started. */
export interface LobbyState {
  /** The code friends type in to join. */
  code: string;
  /** Your place in `members`. In a game it is also your seat. */
  you: number;
  members: MemberView[];
  settings: LobbySettings;
  /** Null while waiting in the lobby. */
  game: PlayerView | null;
  /** When the current player's time runs out, on the server's clock (milliseconds). Null for bots. */
  turnEndsAt: number | null;
  /** When the next round starts by itself, on the server's clock. Null unless a round just ended. */
  nextRoundAt: number | null;
  /** The server's clock when this was sent, so the app can correct for a clock that is off. */
  now: number;
}

export type GameAction =
  | { type: 'arrange'; groups: TileId[][] }
  | { type: 'draw'; source: 'middle' | 'discard' | 'indicator' }
  | { type: 'discard'; tile: TileId }
  | { type: 'close'; tile: TileId }
  | { type: 'acceptRestart' };

/** Every request is answered: it worked, or it didn't and here is why (in words for the player). */
export type Ack<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
type Reply<T = unknown> = (answer: Ack<T>) => void;

export interface ClientToServerEvents {
  /** Open a new lobby. `memberId` is your key to this lobby: keep it to get back in after a dropped connection. */
  create: (
    request: { name: string; settings?: Partial<LobbySettings>; token?: string | null },
    reply: Reply<{ code: string; memberId: string }>,
  ) => void;
  /**
   * `token` is the sign-in token of a player with an account. With it the server uses their
   * profile's name and picture instead of `name`, and puts them back in their own seat if
   * they are already in this lobby (from another device, say).
   */
  join: (
    request: { code: string; name: string; token?: string | null },
    reply: Reply<{ code: string; memberId: string }>,
  ) => void;
  /** Come back after losing the connection. */
  rejoin: (request: { code: string; memberId: string }, reply: Reply) => void;
  /** Host only, before the game starts. */
  settings: (request: Partial<LobbySettings>, reply: Reply) => void;
  /** Host only. */
  start: (reply: Reply) => void;
  action: (action: GameAction, reply: Reply) => void;
  /** Host only: start the next round now, or go back to the lobby once the match is over. */
  next: (reply: Reply) => void;
  leave: (reply: Reply) => void;
}

export interface ServerToClientEvents {
  state: (state: LobbyState) => void;
}
