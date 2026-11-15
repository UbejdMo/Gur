/**
 * What one player may see of a game. The server keeps the whole game and sends each
 * player only their own view: nobody's rack but their own, and the middle as a count.
 * Once a round is over every rack is shown, so players can check the result.
 */
import type { Joker, TileId } from './tiles';
import { handOf } from './game';
import type { Discard, Game, RoundResult, Settings } from './game';

export interface SeatView {
  id: string;
  /** Running total across rounds. */
  total: number;
  tileCount: number;
  /** The rack as arranged: always for the viewer, for everyone once the round is over, otherwise null. */
  groups: TileId[][] | null;
}

export interface RoundView {
  number: number;
  starter: number;
  indicator: TileId;
  joker: Joker;
  /** The seat that took the indicator, or null while it is on the table. */
  indicatorTakenBy: number | null;
  /** How many tiles are left in the middle. Which ones is nobody's business. */
  middleCount: number;
  discards: Discard[];
  lastDiscard: Discard | null;
  current: number;
  turn: number;
  phase: 'draw' | 'discard';
  firstDiscardDone: boolean;
  /** The viewer was dealt 3 or more identical pairs and may still ask for a restart. */
  restartOffered: boolean;
}

export interface PlayerView {
  settings: Settings;
  /** The viewer's seat. */
  seat: number;
  players: SeatView[];
  round: RoundView;
  status: Game['status'];
  results: RoundResult[];
  matchWinners: number[];
}

export function playerView(game: Game, seat: number): PlayerView {
  if (!Number.isInteger(seat) || seat < 0 || seat >= game.players.length) throw new Error('No such seat');
  const { round } = game;
  const open = game.status !== 'playing';
  return {
    settings: { ...game.settings },
    seat,
    players: game.players.map((p, i) => ({
      id: p.id,
      total: p.total,
      tileCount: handOf(p).length,
      groups: open || i === seat ? p.groups.map((g) => [...g]) : null,
    })),
    round: {
      number: round.number,
      starter: round.starter,
      indicator: round.indicator,
      joker: { ...round.joker },
      indicatorTakenBy: round.indicatorTakenBy,
      middleCount: round.middle.length,
      discards: round.discards.map((d) => ({ ...d })),
      lastDiscard: round.lastDiscard ? { ...round.lastDiscard } : null,
      current: round.current,
      turn: round.turn,
      phase: round.phase,
      firstDiscardDone: round.firstDiscardDone,
      restartOffered: !round.firstDiscardDone && round.restartOffers.includes(seat),
    },
    status: game.status,
    results: game.results.map((r) => ({ ...r, winners: [...r.winners], scores: [...r.scores] })),
    matchWinners: [...game.matchWinners],
  };
}
