/**
 * Your side of a table that the server runs: where your tiles lie on the rack, which one is
 * picked, and a line of words for what just happened. The game itself arrives from the
 * server as your view of it; this file never changes the game, it only follows it.
 */
import type { PlayerView, TileId } from '@gur/engine';
import { colsOf, initialLayout, placeTile, reconcile, resizeLayout } from '@/game/rackLayout';
import type { Layout, Side } from '@/game/rackLayout';
import type { Place } from '@/game/tableModel';
import { strings, tileName } from '@/i18n';
import type { Strings } from '@/i18n';

export type OnlineTableState = {
  view: PlayerView;
  names: readonly string[];
  layout: Layout;
  selected: TileId | null;
  /** Why the server refused your last move, if it did. */
  message: string | null;
  log: string | null;
  /** Where the tile you are drawing should land: you dragged it onto the rack. */
  pending: Place | null;
};

export type OnlineTableAction =
  | { type: 'server'; view: PlayerView; names: readonly string[] }
  | { type: 'select'; tile: TileId }
  | { type: 'moveSelected'; slot: number }
  | { type: 'drop'; tile: TileId; slot: number; side?: Side }
  | { type: 'resize'; cols: number }
  | { type: 'pending'; at: Place | null }
  | { type: 'message'; text: string | null };

const handOf = (view: PlayerView): TileId[] => (view.players[view.seat]!.groups ?? []).flat();

export function initialOnlineTable(view: PlayerView, names: readonly string[], cols?: number): OnlineTableState {
  return {
    view,
    names,
    layout: initialLayout(handOf(view), cols),
    selected: null,
    message: null,
    log: null,
    pending: null,
  };
}

/**
 * What just happened at the table, in words, from your view before and after. Null when
 * nothing worth saying changed (somebody only moved tiles on their own rack).
 */
export function describeChange(
  before: PlayerView,
  after: PlayerView,
  names: readonly string[],
  t: Strings = strings(),
): string | null {
  // Your own moves have their own words: Albanian says "Hodhe", not "Ti hodhi".
  const you = (seat: number) => seat === after.seat;
  const name = (seat: number) => names[seat]!;
  if (after.results.length > before.results.length) {
    const result = after.results.at(-1)!;
    if (result.reason === 'stockOut') return t.moves.stockOut;
    const closer = result.winners[0]!;
    if (after.round.indicatorTakenBy === closer) {
      return you(closer) ? t.moves.youClosedWithIndicator : t.moves.closedWithIndicator(name(closer));
    }
    return you(closer) ? t.moves.youClosed : t.moves.closed(name(closer));
  }
  if (after.round.number !== before.round.number) return t.moves.round(after.round.number);

  const b = before.round;
  const a = after.round;
  // A discard: the turn passed on.
  if (a.turn > b.turn && a.lastDiscard) {
    const tile = tileName(a.lastDiscard.tile, t);
    return you(a.lastDiscard.by) ? t.moves.youDiscarded(tile) : t.moves.discarded(name(a.lastDiscard.by), tile);
  }
  // A draw: still the same turn, now with a tile to discard.
  if (a.turn === b.turn && b.phase === 'draw' && a.phase === 'discard') {
    const mine = you(a.current);
    if (a.indicatorTakenBy !== null && b.indicatorTakenBy === null) {
      return mine ? t.moves.youTookIndicator : t.moves.tookIndicator(name(a.current));
    }
    if (a.middleCount < b.middleCount) return mine ? t.moves.youDrew : t.moves.drew(name(a.current));
    return mine ? t.moves.youTookDiscard : t.moves.tookDiscard(name(a.current));
  }
  // Everything is new although the round is the same: somebody asked for a restart.
  if (a.turn === 0 && a.indicator !== b.indicator) return t.moves.restart;
  return null;
}

/** Follows the server: your tiles stay where you put them, tiles that left go, new ones arrive. */
function follow(state: OnlineTableState, view: PlayerView, names: readonly string[]): OnlineTableState {
  const hand = handOf(view);
  const kept = hand.filter((t) => state.layout.includes(t));
  // A new round or a restart deals a whole new hand: lay it out afresh, 7 on top and 7 below.
  const fresh = view.round.number !== state.view.round.number || kept.length < hand.length - 1;
  let layout: Layout;
  if (fresh) {
    layout = initialLayout(hand, colsOf(state.layout));
  } else {
    const arrived = hand.filter((t) => !state.layout.includes(t));
    layout = reconcile(state.layout, kept);
    // The tile you dragged from the table lands on the slot you dropped it on.
    if (state.pending && arrived.length === 1 && state.pending.slot < layout.length) {
      layout = placeTile(layout, arrived[0]!, state.pending.slot, state.pending.side);
    }
    layout = reconcile(layout, hand);
  }
  return {
    ...state,
    view,
    names,
    layout,
    selected: state.selected !== null && hand.includes(state.selected) ? state.selected : null,
    log: describeChange(state.view, view, names) ?? state.log,
    // A pending place is used by the next tile that arrives, or dropped when the turn moves on.
    pending: hand.length === 15 ? null : state.pending,
  };
}

export function onlineTableReducer(state: OnlineTableState, action: OnlineTableAction): OnlineTableState {
  switch (action.type) {
    case 'server':
      return follow(state, action.view, action.names);
    case 'select':
      return { ...state, selected: state.selected === action.tile ? null : action.tile };
    case 'moveSelected':
      if (state.selected === null) return state;
      return { ...state, layout: placeTile(state.layout, state.selected, action.slot), selected: null };
    case 'drop':
      if (!state.layout.includes(action.tile)) return state;
      return { ...state, layout: placeTile(state.layout, action.tile, action.slot, action.side), selected: null };
    case 'resize':
      return { ...state, layout: resizeLayout(state.layout, action.cols) };
    case 'pending':
      return { ...state, pending: action.at };
    case 'message':
      return state.message === action.text ? state : { ...state, message: action.text };
  }
}
