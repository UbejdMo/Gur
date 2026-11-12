/**
 * Sizes for what lies on the felt: the middle pile in the centre and a row of
 * discards for each player around it. Everything has to fit screens from a
 * phone held sideways to a desktop, so the sizes are worked out from the room there is.
 */

/** How many of each player's discards stay in view. */
export const DISCARDS_SHOWN = 6;

/** Width of the badge that says whose row it is; a narrower one where width is short. */
export const DISCARD_BADGE = 30;
export const DISCARD_BADGE_COMPACT = 20;
const TILE_FRAME = 2; // a 1-point frame on each side of a tile
const TILE_GAP = 2;
const ROW_PAD = 4;
const BADGE_GAP = 4;

/** Width of one player's discard row for a given tile width. */
export function discardRowWidth(tile: number, compact = false): number {
  const badge = compact ? DISCARD_BADGE_COMPACT : DISCARD_BADGE;
  return badge + BADGE_GAP + ROW_PAD * 2 + DISCARDS_SHOWN * (tile + TILE_FRAME) + (DISCARDS_SHOWN - 1) * TILE_GAP;
}

/** Height of a discard row. */
export function discardRowHeight(tile: number): number {
  return Math.round(tile * 1.4) + TILE_FRAME + ROW_PAD * 2;
}

/** Width of the middle pile: its stacks, the indicator and the frame around them. */
export function pileWidth(stacks: number, tile: number): number {
  return (stacks + 1) * tile + 20;
}

/** Height of the middle pile with the count under it. */
export function pileHeight(tile: number): number {
  return Math.round(tile * 1.4) + 46;
}

export type FeltLayout = {
  /**
   * 'sides': discard rows left and right of the pile. 'grid': two above and two below, with
   * narrow badges to leave the tiles more width. 'stack': one per line.
   */
  arrangement: 'sides' | 'grid' | 'stack';
  /** Width of a discarded tile. */
  discardTile: number;
  /** How many face-down stacks the middle shows at most. */
  stacks: number;
};

const GAP = 10;
const MIN_TILE = 12;
const MAX_STACKS = 8;
const MIN_STACKS = 3;
const widthFor = (rowWidth: number, compact = false) =>
  Math.floor((rowWidth - discardRowWidth(0, compact)) / DISCARDS_SHOWN);
const heightFor = (rowHeight: number) => Math.floor((rowHeight - TILE_FRAME - ROW_PAD * 2) / 1.4);

/**
 * Fits the pile and four discard rows into the felt's inner width and height.
 * `tile` is the pile's tile width; discarded tiles are never larger than `maxDiscard`.
 */
export function feltLayout(width: number, height: number, tile: number, wide: boolean, maxDiscard = 32): FeltLayout {
  const clamp = (n: number) => Math.max(MIN_TILE, Math.min(maxDiscard, n));
  const stacksIn = (room: number) => Math.max(MIN_STACKS, Math.min(MAX_STACKS, Math.floor((room - 20) / tile) - 1));

  if (wide) {
    // Two rows on each side of the pile. Tiles first take the size the height allows; the pile
    // then gets what is left, down to three stacks; only after that do the tiles shrink.
    const byHeight = heightFor((height - GAP) / 2);
    const want = clamp(Math.min(tile, byHeight));
    const stacks = stacksIn(width - 2 * (discardRowWidth(want) + GAP));
    const byWidth = widthFor((width - pileWidth(stacks, tile)) / 2 - GAP);
    return { arrangement: 'sides', discardTile: clamp(Math.min(want, byWidth)), stacks };
  }

  // Upright: the rows go above and below the pile, either two to a line or one to a line,
  // whichever leaves the tiles bigger.
  const stacks = stacksIn(width);
  const spare = height - pileHeight(tile);
  const grid = clamp(Math.min(widthFor((width - GAP) / 2, true), heightFor((spare - 3 * GAP) / 2)));
  const stack = clamp(Math.min(widthFor(width), heightFor((spare - 5 * GAP) / 4)));
  return stack > grid
    ? { arrangement: 'stack', discardTile: stack, stacks }
    : { arrangement: 'grid', discardTile: grid, stacks };
}
