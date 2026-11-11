/**
 * Round and match flow. Every action takes a game state and returns a new one;
 * the input is never changed. Illegal actions throw RuleError.
 *
 * Seats are numbered in counter-clockwise order, so the next player is seat + 1.
 * The server owns the clock: it calls timeoutMove() when turnSeconds() runs out.
 */
import { TILE_COUNT, TILES, getTile, isRealJoker, jokerFromIndicator, tileValue } from './tiles';
import type { Joker, TileId } from './tiles';
import { checkClosingHand, identicalPairCount, penalty, unconnectedTiles } from './hand';
import type { ClosingHand } from './hand';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export type Rng = () => number;

export interface Settings {
  /** 12-13-1 allowed (13-1-2 never is) */
  aceHigh: boolean;
  /** Friends lobby: 1, 3 or 5. Online with random players: 1. */
  rounds: 1 | 3 | 5;
}

export interface Player {
  id: string;
  /** The rack as the player arranged it. Only groups that are valid melds count as connected. */
  groups: TileId[][];
  /** Running total across rounds; lowest wins. */
  total: number;
}

export interface Deal {
  indicator: TileId;
  hands: TileId[][];
  /** The middle, top first. */
  middle: TileId[];
}

export interface Round {
  number: number;
  starter: number;
  indicator: TileId;
  joker: Joker;
  middle: TileId[];
  /** All discarded tiles, oldest first. Only the last can be taken, and only by the next player. */
  discards: TileId[];
  lastDiscard: { tile: TileId; by: number } | null;
  current: number;
  phase: 'draw' | 'discard';
  firstDiscardDone: boolean;
  /** Seats offered a restart because they were dealt 3 or more identical pairs. */
  restartOffers: number[];
}

export interface RoundResult {
  round: number;
  reason: 'close' | 'stockOut';
  winners: number[];
  scores: number[];
  /** Closed by discarding the real joker: -20 for the winner, others' points doubled. */
  double: boolean;
  closingHand?: ClosingHand;
  closingTile?: TileId;
}

export interface Game {
  settings: Settings;
  players: Player[];
  round: Round;
  status: 'playing' | 'roundOver' | 'matchOver';
  results: RoundResult[];
  matchWinners: number[];
}

export const HAND_SIZE = 14;
export const FIRST_TURN_SECONDS = 15;
export const TURN_SECONDS = 10;
export const CLOSE_SCORE = -10;
export const DOUBLE_CLOSE_SCORE = -20;

// ---------- helpers ----------

export function handOf(player: Player): TileId[] {
  return player.groups.flat();
}

function clone(game: Game): Game {
  // Game state is plain JSON data. A JSON round trip works on every JavaScript
  // engine the app runs on, including React Native's, unlike structuredClone.
  return JSON.parse(JSON.stringify(game)) as Game;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function nextSeat(game: Game, seat: number): number {
  return (seat + 1) % game.players.length;
}

function removeFromGroups(groups: TileId[][], tile: TileId): TileId[][] {
  return groups.map((g) => g.filter((t) => t !== tile)).filter((g) => g.length > 0);
}

function assertPlaying(game: Game): void {
  if (game.status !== 'playing') throw new RuleError('The round is not in progress');
}

function assertTurn(game: Game, seat: number, phase: Round['phase']): void {
  assertPlaying(game);
  if (game.round.current !== seat) throw new RuleError('It is not your turn');
  if (game.round.phase !== phase) {
    throw new RuleError(phase === 'draw' ? 'You have already drawn this turn' : 'You must draw before discarding');
  }
}

/** Seeded random numbers, for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- dealing ----------

/** Shuffles all 106 tiles, turns an indicator (a printed joker is skipped and redrawn), and deals 14 to each player. */
export function randomDeal(playerCount: number, rng: Rng): Deal {
  if (playerCount < 2 || playerCount > 4) throw new RuleError('A game needs 2 to 4 players');
  const deck = shuffle(
    TILES.map((t) => t.id),
    rng,
  );
  const idx = deck.findIndex((id) => !getTile(id).printedJoker);
  const [indicator] = deck.splice(idx, 1);
  const hands: TileId[][] = [];
  for (let p = 0; p < playerCount; p++) hands.push(deck.splice(0, HAND_SIZE));
  return { indicator: indicator!, hands, middle: deck };
}

function validateDeal(deal: Deal, playerCount: number): void {
  if (deal.hands.length !== playerCount) throw new RuleError('One hand per player is required');
  if (deal.hands.some((h) => h.length !== HAND_SIZE)) throw new RuleError(`Each hand must have ${HAND_SIZE} tiles`);
  if (getTile(deal.indicator).printedJoker) throw new RuleError('A printed joker cannot be the indicator');
  const all = [deal.indicator, ...deal.hands.flat(), ...deal.middle];
  if (all.length !== TILE_COUNT || new Set(all).size !== TILE_COUNT) {
    throw new RuleError('A deal must use every tile exactly once');
  }
}

function applyDeal(game: Game, roundNumber: number, starter: number, deal: Deal): void {
  validateDeal(deal, game.players.length);
  const middle = [...deal.middle];
  game.players.forEach((p, i) => {
    // Dealt tiles start as one row on the rack, in the order dealt; the player builds groups from it.
    p.groups = [[...deal.hands[i]!]];
  });
  const restartOffers = deal.hands.flatMap((h, i) => (identicalPairCount(h) >= 3 ? [i] : []));
  // The first player draws at once, holding 15 tiles.
  const first = middle.shift()!;
  game.players[starter]!.groups.push([first]);
  game.round = {
    number: roundNumber,
    starter,
    indicator: deal.indicator,
    joker: jokerFromIndicator(deal.indicator),
    middle,
    discards: [],
    lastDiscard: null,
    current: starter,
    phase: 'discard',
    firstDiscardDone: false,
    restartOffers,
  };
  game.status = 'playing';
}

/** Starts a match. A random player starts round one. */
export function createGame(settings: Settings, playerIds: string[], rng: Rng): Game {
  const starter = Math.floor(rng() * playerIds.length);
  return createGameWithDeal(settings, playerIds, starter, randomDeal(playerIds.length, rng));
}

/** Starts a match from a known deal (tests, replays). */
export function createGameWithDeal(settings: Settings, playerIds: string[], starter: number, deal: Deal): Game {
  if (playerIds.length < 2 || playerIds.length > 4) throw new RuleError('A game needs 2 to 4 players');
  const game = {
    settings: { ...settings },
    players: playerIds.map((id) => ({ id, groups: [], total: 0 })),
    round: undefined as unknown as Round,
    status: 'playing',
    results: [],
    matchWinners: [],
  } satisfies Game as Game;
  applyDeal(game, 1, starter, deal);
  return game;
}

// ---------- actions ----------

/** A player offered a restart accepts it before the first discard: everyone gets a new deal. */
export function acceptRestart(game: Game, seat: number, rng: Rng): Game {
  assertPlaying(game);
  if (game.round.firstDiscardDone) throw new RuleError('A restart must be accepted before the first discard');
  if (!game.round.restartOffers.includes(seat)) throw new RuleError('You were not offered a restart');
  const g = clone(game);
  applyDeal(g, g.round.number, g.round.starter, randomDeal(g.players.length, rng));
  return g;
}

/** Rearranges a rack. Allowed at any time during a round; must contain exactly the player's tiles. */
export function arrange(game: Game, seat: number, groups: TileId[][]): Game {
  assertPlaying(game);
  const player = game.players[seat];
  if (!player) throw new RuleError('Unknown seat');
  const current = handOf(player).sort((a, b) => a - b);
  const proposed = groups.flat().sort((a, b) => a - b);
  if (current.length !== proposed.length || current.some((t, i) => t !== proposed[i])) {
    throw new RuleError('An arrangement must contain exactly your tiles');
  }
  const g = clone(game);
  g.players[seat]!.groups = groups.filter((gr) => gr.length > 0).map((gr) => [...gr]);
  return g;
}

/** Take the tile the previous player just discarded, or draw from the middle. */
export function draw(game: Game, seat: number, source: 'middle' | 'discard'): Game {
  assertTurn(game, seat, 'draw');
  const g = clone(game);
  const r = g.round;
  let tile: TileId;
  if (source === 'discard') {
    if (!r.lastDiscard) throw new RuleError('There is no discard to take');
    tile = r.lastDiscard.tile;
    r.discards.pop();
  } else {
    if (r.middle.length === 0) throw new RuleError('The middle is empty');
    tile = r.middle.shift()!;
  }
  // Older discards are gone for good once the next player has drawn.
  r.lastDiscard = null;
  g.players[seat]!.groups.push([tile]);
  r.phase = 'discard';
  return g;
}

/** Discard a tile. If the last middle tile has been drawn, the round ends. */
export function discard(game: Game, seat: number, tile: TileId): Game {
  assertTurn(game, seat, 'discard');
  if (!handOf(game.players[seat]!).includes(tile)) throw new RuleError('That tile is not in your hand');
  const g = clone(game);
  const r = g.round;
  const p = g.players[seat]!;
  p.groups = removeFromGroups(p.groups, tile);
  r.discards.push(tile);
  r.lastDiscard = { tile, by: seat };
  r.firstDiscardDone = true;
  r.restartOffers = [];
  if (r.middle.length === 0) {
    finishRound(g, stockOutResult(g));
  } else {
    r.current = nextSeat(g, seat);
    r.phase = 'draw';
  }
  return g;
}

/** Close by discarding the 15th tile. The other 14 must form a closing hand. */
export function close(game: Game, seat: number, tile: TileId): Game {
  assertTurn(game, seat, 'discard');
  const hand = handOf(game.players[seat]!);
  if (!hand.includes(tile)) throw new RuleError('That tile is not in your hand');
  const r0 = game.round;
  const rest = hand.filter((t) => t !== tile);
  const closingHand = checkClosingHand(rest, r0.joker, game.settings.aceHigh);
  if (!closingHand) throw new RuleError('Those tiles are not a closing hand');

  const g = clone(game);
  const r = g.round;
  const double = isRealJoker(tile, r.joker);
  const scores = g.players.map((p, i) =>
    i === seat
      ? double
        ? DOUBLE_CLOSE_SCORE
        : CLOSE_SCORE
      : penalty(p.groups, r.joker, g.settings.aceHigh) * (double ? 2 : 1),
  );
  const winner = g.players[seat]!;
  winner.groups = closingHand.kind === 'melds' ? closingHand.groups.map((x) => [...x]) : [rest];
  r.discards.push(tile);
  r.lastDiscard = null;
  finishRound(g, {
    round: r.number,
    reason: 'close',
    winners: [seat],
    scores,
    double,
    closingHand,
    closingTile: tile,
  });
  return g;
}

/**
 * The automatic move when a turn's time runs out: draw from the middle if the
 * player hasn't drawn, then discard their highest unconnected tile. Real jokers
 * are kept unless nothing else is left. It never closes.
 */
export function timeoutMove(game: Game): Game {
  assertPlaying(game);
  let g = game;
  const seat = g.round.current;
  if (g.round.phase === 'draw') {
    g = draw(g, seat, g.round.middle.length > 0 ? 'middle' : 'discard');
  }
  return discard(g, seat, autoDiscardTile(g, seat));
}

export function autoDiscardTile(game: Game, seat: number): TileId {
  const { joker } = game.round;
  const p = game.players[seat]!;
  const notWild = (t: TileId) => !isRealJoker(t, joker);
  const unconnected = unconnectedTiles(p.groups, joker, game.settings.aceHigh).filter(notWild);
  const pool = unconnected.length > 0 ? unconnected : handOf(p).filter(notWild);
  const candidates = pool.length > 0 ? pool : handOf(p);
  return candidates.reduce((best, t) => (tileValue(t, joker) > tileValue(best, joker) ? t : best));
}

/** Seconds allowed for the current turn: 15 for the first turn of a round, 10 after that. */
export function turnSeconds(game: Game): number {
  return game.round.firstDiscardDone ? TURN_SECONDS : FIRST_TURN_SECONDS;
}

/** Starts the next round. The first player moves one place counter-clockwise. */
export function nextRound(game: Game, rng: Rng): Game {
  return nextRoundWithDeal(game, randomDeal(game.players.length, rng));
}

export function nextRoundWithDeal(game: Game, deal: Deal): Game {
  if (game.status !== 'roundOver') throw new RuleError('The round is not over, or the match has ended');
  const g = clone(game);
  applyDeal(g, g.round.number + 1, nextSeat(g, g.round.starter), deal);
  return g;
}

// ---------- scoring ----------

function stockOutResult(game: Game): RoundResult {
  const { joker } = game.round;
  const scores = game.players.map((p) => penalty(p.groups, joker, game.settings.aceHigh));
  const best = Math.min(...scores);
  return {
    round: game.round.number,
    reason: 'stockOut',
    winners: scores.flatMap((s, i) => (s === best ? [i] : [])),
    scores,
    double: false,
  };
}

function finishRound(game: Game, result: RoundResult): void {
  result.scores.forEach((s, i) => {
    game.players[i]!.total += s;
  });
  game.results.push(result);
  if (game.results.length >= game.settings.rounds) {
    game.status = 'matchOver';
    const best = Math.min(...game.players.map((p) => p.total));
    game.matchWinners = game.players.flatMap((p, i) => (p.total === best ? [i] : []));
  } else {
    game.status = 'roundOver';
  }
}
