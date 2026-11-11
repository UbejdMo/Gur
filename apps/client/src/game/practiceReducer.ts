import { RuleError, arrange, botTurn, close, discard, draw, handOf, timeoutMove } from '@gur/engine';
import type { Game, TileId } from '@gur/engine';
import { initialLayout, layoutGroups, moveToSlot, reconcile, sameGroups } from './rackLayout';
import type { Layout } from './rackLayout';

export const YOU = 0;

export type PracticeState = {
  game: Game;
  /** Your rack, slot by slot. The engine's arrangement for you always matches it. */
  layout: Layout;
  selected: TileId | null;
  message: string | null;
};

export type PracticeAction =
  | { type: 'select'; tile: TileId }
  | { type: 'moveSelected'; slot: number }
  | { type: 'drop'; tile: TileId; slot: number }
  | { type: 'dropUp'; tile: TileId }
  | { type: 'drawMiddle' }
  | { type: 'takeDiscard' }
  | { type: 'discard'; tile?: TileId }
  | { type: 'close'; tile?: TileId }
  | { type: 'bot' }
  | { type: 'timeout' }
  | { type: 'newGame'; game: Game };

export function initialState(game: Game): PracticeState {
  return withRack({ game, layout: [], selected: null, message: null }, initialLayout(handOf(game.players[YOU]!)));
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
function play(state: PracticeState, fn: (g: Game) => Game): PracticeState {
  try {
    return withRack({ ...state, game: fn(state.game), selected: null, message: null });
  } catch (e) {
    if (e instanceof RuleError) return { ...state, message: e.message };
    throw e;
  }
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  const { game } = state;
  switch (action.type) {
    case 'select':
      return { ...state, selected: state.selected === action.tile ? null : action.tile };
    case 'moveSelected':
      if (state.selected === null) return state;
      return { ...withRack(state, moveToSlot(state.layout, state.selected, action.slot)), selected: null };
    case 'drop':
      if (!state.layout.includes(action.tile)) return state;
      return { ...withRack(state, moveToSlot(state.layout, action.tile, action.slot)), selected: null };
    case 'dropUp':
      // Dragging a tile up off the rack discards it, but only when it is your turn to discard.
      if (game.status !== 'playing' || game.round.current !== YOU || game.round.phase !== 'discard') return state;
      return play(state, (g) => discard(g, YOU, action.tile));
    case 'drawMiddle':
      return play(state, (g) => draw(g, YOU, 'middle'));
    case 'takeDiscard':
      return play(state, (g) => draw(g, YOU, 'discard'));
    case 'discard': {
      const tile = action.tile ?? state.selected;
      return tile === null ? state : play(state, (g) => discard(g, YOU, tile));
    }
    case 'close': {
      const tile = action.tile ?? state.selected;
      return tile === null ? state : play(state, (g) => close(g, YOU, tile));
    }
    case 'bot':
      if (game.status !== 'playing' || game.round.current === YOU) return state;
      return withRack({ ...state, game: botTurn(game) });
    case 'timeout':
      if (game.status !== 'playing' || game.round.current !== YOU) return state;
      return withRack({ ...state, game: timeoutMove(game), selected: null });
    case 'newGame':
      return initialState(action.game);
  }
}
