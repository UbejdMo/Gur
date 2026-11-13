import {
  RuleError,
  arrange,
  arrangedClosingHand,
  botTurn,
  close,
  describeTile,
  discard,
  draw,
  faceOf,
  handOf,
  isMeld,
  isRealJoker,
  timeoutMove,
} from '@gur/engine';
import type { Game, TileId } from '@gur/engine';
import { colsOf, initialLayout, layoutGroups, placeTile, reconcile, resizeLayout, sameGroups } from './rackLayout';
import type { Layout, Side } from './rackLayout';

export const YOU = 0;

export type PracticeState = {
  game: Game;
  /** Your rack, slot by slot. The engine's arrangement for you always matches it. */
  layout: Layout;
  selected: TileId | null;
  message: string | null;
  /** The last thing that happened at the table, in words. */
  log: string | null;
};

export type PracticeAction =
  | { type: 'select'; tile: TileId }
  | { type: 'moveSelected'; slot: number }
  | { type: 'drop'; tile: TileId; slot: number; side?: Side }
  | { type: 'dropUp'; tile: TileId }
  | { type: 'drawMiddle'; at?: Place }
  | { type: 'takeDiscard'; at?: Place }
  | { type: 'takeIndicator'; at?: Place }
  | { type: 'resize'; cols: number }
  | { type: 'discard'; tile?: TileId }
  | { type: 'close'; tile?: TileId }
  | { type: 'bot' }
  | { type: 'timeout' }
  | { type: 'newGame'; game: Game };

/** A place on the rack: a slot, and which half of it was aimed at when a tile is already there. */
export type Place = { slot: number; side: Side };

export function initialState(game: Game, cols?: number): PracticeState {
  return withRack(
    { game, layout: [], selected: null, message: null, log: null },
    initialLayout(handOf(game.players[YOU]!), cols),
  );
}

/**
 * Tiles you could discard right now to close, real jokers first (closing with one is a double).
 * The rack decides: taking the tile off must leave every group on it a meld (or seven pairs, or a mosaic).
 */
export function closingTiles(game: Game): TileId[] {
  const { round } = game;
  if (game.status !== 'playing' || round.current !== YOU || round.phase !== 'discard') return [];
  const { groups } = game.players[YOU]!;
  const hand = groups.flat();
  if (hand.length !== 15) return [];
  return hand
    .filter((t) => {
      // Taking a tile out of the middle of a group leaves a gap, which splits the group in two.
      const rest = groups.flatMap((g) => (g.includes(t) ? [g.slice(0, g.indexOf(t)), g.slice(g.indexOf(t) + 1)] : [g]));
      return arrangedClosingHand(
        rest.filter((g) => g.length > 0),
        round.joker,
        game.settings.aceHigh,
      );
    })
    .sort((a, b) => Number(isRealJoker(b, round.joker)) - Number(isRealJoker(a, round.joker)));
}

/**
 * The tile Close uses when you haven't picked one: the tile you picked if it closes, otherwise
 * the tile you left on its own outside your melds, otherwise a real joker (a double), otherwise any.
 */
export function chooseClosingTile(state: PracticeState): TileId | null {
  const options = closingTiles(state.game);
  if (options.length === 0) return null;
  if (state.selected !== null && options.includes(state.selected)) return state.selected;
  const { joker } = state.game.round;
  const { aceHigh } = state.game.settings;
  const loose = layoutGroups(state.layout)
    .filter(
      (g) =>
        !isMeld(
          g.map((t) => faceOf(t, joker)),
          aceHigh,
        ),
    )
    .flat();
  return options.find((t) => loose.includes(t)) ?? options[0]!;
}

/** Puts the rack in step with your hand, and the engine's arrangement in step with the rack. */
function withRack(state: PracticeState, layout: Layout = state.layout): PracticeState {
  const fitted = reconcile(layout, handOf(state.game.players[YOU]!));
  const groups = layoutGroups(fitted);
  let game = state.game;
  if (game.status === 'playing' && !sameGroups(groups, game.players[YOU]!.groups)) {
    game = arrange(game, YOU, groups);
  }
  return { ...state, game, layout: fitted };
}

/** Applies an engine action; a rule error becomes a message and nothing changes. */
function play(state: PracticeState, fn: (g: Game) => Game, log: string, at?: Place): PracticeState {
  try {
    const game = fn(state.game);
    // A tile drawn by dragging it onto the rack goes where it was dropped.
    const drawn = at && handOf(game.players[YOU]!).find((t) => !state.layout.includes(t));
    const layout =
      at && drawn !== undefined && at.slot < state.layout.length
        ? placeTile(state.layout, drawn, at.slot, at.side)
        : state.layout;
    return withRack({ ...state, game, selected: null, message: null, log }, layout);
  } catch (e) {
    if (e instanceof RuleError) return { ...state, message: e.message };
    throw e;
  }
}

/** Describes a bot's turn by comparing the table before and after it. */
function describeBotTurn(before: Game, after: Game): string {
  const seat = before.round.current;
  const name = before.players[seat]!.id;
  if (after.round.indicatorTakenBy === seat) return `${name} took the indicator and closed`;
  if (after.results.length > before.results.length) return `${name} closed`;
  // The middle didn't shrink, so the bot took the last discard instead.
  const took = before.round.lastDiscard !== null && after.round.middle.length === before.round.middle.length;
  const out = after.round.lastDiscard ? describeTile(after.round.lastDiscard.tile) : 'a tile';
  return `${name} ${took ? 'picked up the last discarded tile' : 'drew from the middle'} and discarded ${out}`;
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  const { game } = state;
  switch (action.type) {
    case 'select':
      return { ...state, selected: state.selected === action.tile ? null : action.tile };
    case 'moveSelected':
      if (state.selected === null) return state;
      return { ...withRack(state, placeTile(state.layout, state.selected, action.slot)), selected: null };
    case 'drop':
      if (!state.layout.includes(action.tile)) return state;
      return { ...withRack(state, placeTile(state.layout, action.tile, action.slot, action.side)), selected: null };
    case 'resize':
      return withRack(state, resizeLayout(state.layout, action.cols));
    case 'dropUp':
      // Dragging a tile up off the rack plays it: if the rest of the rack is a closing hand you close,
      // which is how a close is declared ("the 15th tile is removed"). Otherwise it is a discard.
      if (game.status !== 'playing' || game.round.current !== YOU || game.round.phase !== 'discard') return state;
      if (closingTiles(game).includes(action.tile)) {
        return play(state, (g) => close(g, YOU, action.tile), 'You closed');
      }
      return play(state, (g) => discard(g, YOU, action.tile), `You discarded ${describeTile(action.tile)}`);
    case 'drawMiddle':
      return play(state, (g) => draw(g, YOU, 'middle'), 'You drew from the middle', action.at);
    case 'takeDiscard':
      return play(state, (g) => draw(g, YOU, 'discard'), 'You picked up the last discarded tile', action.at);
    case 'takeIndicator':
      // Only allowed when it completes your hand; the engine says so otherwise.
      return play(state, (g) => draw(g, YOU, 'indicator'), 'You took the indicator', action.at);
    case 'discard': {
      const tile = action.tile ?? state.selected;
      return tile === null ? state : play(state, (g) => discard(g, YOU, tile), `You discarded ${describeTile(tile)}`);
    }
    case 'close': {
      const tile = action.tile ?? chooseClosingTile(state);
      if (tile === null) return { ...state, message: 'Connect all your tiles into melds on the rack to close' };
      return play(state, (g) => close(g, YOU, tile), 'You closed');
    }
    case 'bot': {
      if (game.status !== 'playing' || game.round.current === YOU) return state;
      const next = botTurn(game);
      return withRack({ ...state, game: next, log: describeBotTurn(game, next) });
    }
    case 'timeout':
      if (game.status !== 'playing' || game.round.current !== YOU) return state;
      return withRack({
        ...state,
        game: timeoutMove(game),
        selected: null,
        log: 'Time ran out: a tile was played for you',
      });
    case 'newGame':
      return initialState(action.game, colsOf(state.layout));
  }
}
