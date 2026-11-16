/**
 * What the table screen needs, whoever runs the game: the practice game on this device
 * or the server when playing with friends. The table only ever sees one player's view.
 */
import { arrangedClosingHand, faceOf, isMeld, isRealJoker } from '@gur/engine';
import type { PlayerView, TileId } from '@gur/engine';
import type { Layout, Side } from './rackLayout';

/** A place on the rack: a slot, and which half of it was aimed at when a tile is already there. */
export type Place = { slot: number; side: Side };

export type TableModel = {
  /** Your view of the game: your own rack, and what everyone can see. */
  view: PlayerView;
  /** The name shown for each seat. */
  names: readonly string[];
  /** A picture for each seat, where the player has one (signed-in players, online). */
  avatars?: readonly (string | null)[];
  /** Your rack, slot by slot. */
  layout: Layout;
  selected: TileId | null;
  /** Why your last move was refused, if it was. */
  message: string | null;
  /** The last thing that happened at the table, in words. */
  log: string | null;
  /** Seconds left for the player whose turn it is, while a clock is running for them. */
  secondsLeft: number | null;

  yourTurn: boolean;
  /** Discard is on: it is your turn to discard, a tile is picked, and you are not bound to close. */
  canDiscard: boolean;
  /** You took the indicator, so the only way to play a tile now is to close. */
  tookIndicator: boolean;
  /** The rack shows a closing hand. */
  canClose: boolean;
  /** It is your turn to draw and there is a discard you may take. */
  lastDiscardTakeable: boolean;

  select: (tile: TileId) => void;
  moveSelected: (slot: number) => void;
  drop: (tile: TileId, slot: number, side?: Side) => void;
  resize: (cols: number) => void;
  /** A tile was dragged up off the rack: close with it if that closes, otherwise discard it. */
  dropUp: (tile: TileId) => void;
  drawMiddle: (at?: Place) => void;
  takeDiscard: (at?: Place) => void;
  takeIndicator: (at?: Place) => void;
  discard: (tile?: TileId) => void;
  close: (tile?: TileId) => void;
};

/**
 * Where the other players sit, seen from your seat. Play runs counter-clockwise, so the next
 * player is on your right. With three players nobody sits across; with two, the other
 * player does.
 */
export function seatsAround(
  you: number,
  count: number,
): { right: number | null; across: number | null; left: number | null } {
  const at = (steps: number) => (you + steps) % count;
  if (count === 2) return { right: null, across: at(1), left: null };
  if (count === 3) return { right: at(1), across: null, left: at(2) };
  return { right: at(1), across: at(2), left: at(3) };
}

/**
 * Tiles that could be discarded from this rack to close, real jokers first (closing with one
 * is a double). The rack decides: taking the tile off must leave every group on it a meld
 * (or seven pairs, or a mosaic). Taking a tile out of the middle of a group leaves a gap,
 * which splits the group in two.
 */
export function closingTilesFor(
  groups: readonly (readonly TileId[])[],
  joker: PlayerView['round']['joker'],
  aceHigh: boolean,
): TileId[] {
  const hand = groups.flat();
  if (hand.length !== 15) return [];
  return hand
    .filter((t) => {
      const rest = groups.flatMap((g) => (g.includes(t) ? [g.slice(0, g.indexOf(t)), g.slice(g.indexOf(t) + 1)] : [g]));
      return arrangedClosingHand(
        rest.filter((g) => g.length > 0),
        joker,
        aceHigh,
      );
    })
    .sort((a, b) => Number(isRealJoker(b, joker)) - Number(isRealJoker(a, joker)));
}

/**
 * The tile Close uses when you haven't picked one: the tile you picked if it closes, otherwise
 * the tile you left on its own outside your melds, otherwise the first option (a real joker
 * comes first: a double).
 */
export function pickClosingTile(
  options: readonly TileId[],
  selected: TileId | null,
  groups: readonly (readonly TileId[])[],
  joker: PlayerView['round']['joker'],
  aceHigh: boolean,
): TileId | null {
  if (options.length === 0) return null;
  if (selected !== null && options.includes(selected)) return selected;
  const loose = groups
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

/** What you may do right now, worked out from your view and your rack as it lies. */
export function tableFlags(view: PlayerView, groups: readonly (readonly TileId[])[], selected: TileId | null) {
  const { round } = view;
  const playing = view.status === 'playing';
  const yourTurn = playing && round.current === view.seat;
  const canDiscardNow = yourTurn && round.phase === 'discard';
  const tookIndicator = playing && round.indicatorTakenBy === view.seat;
  const canCloseWith = new Set(canDiscardNow ? closingTilesFor(groups, round.joker, view.settings.aceHigh) : []);
  return {
    yourTurn,
    canDiscardNow,
    canDiscard: canDiscardNow && selected !== null && !tookIndicator,
    tookIndicator,
    canCloseWith,
    canClose: canCloseWith.size > 0,
    lastDiscardTakeable: yourTurn && round.phase === 'draw' && round.lastDiscard !== null,
  };
}
