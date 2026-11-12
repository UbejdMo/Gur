/**
 * Sizes for what lies on the felt: the middle pile in the centre and, in front of each
 * player, the row of tiles left for them. Everything has to fit screens from a phone held
 * sideways to a desktop, so the sizes are worked out from the room there is.
 */

/** How many of the tiles left for a player stay in view. */
export const DISCARDS_SHOWN = 6;

/** Width of the badge that says whose row it is; a narrower one where width is short. */
export const DISCARD_BADGE = 30;
export const DISCARD_BADGE_COMPACT = 20;
const TILE_FRAME = 2; // a 1-point frame on each side of a tile
const TILE_GAP = 2;
const ROW_PAD = 4;
const BADGE_GAP = 4;

/** The name badge at the start of a row: full, narrow, or none when the player's panel is beside it. */
export type RowBadge = 'full' | 'compact' | 'none';

/** Width of one player's row for a given tile width. */
export function discardRowWidth(tile: number, badge: RowBadge = 'full'): number {
  const lead = badge === 'none' ? 0 : (badge === 'compact' ? DISCARD_BADGE_COMPACT : DISCARD_BADGE) + BADGE_GAP;
  return lead + ROW_PAD * 2 + DISCARDS_SHOWN * (tile + TILE_FRAME) + (DISCARDS_SHOWN - 1) * TILE_GAP;
}

/** Height of a discard row. */
export function discardRowHeight(tile: number): number {
  return Math.round(tile * 1.4) + TILE_FRAME + ROW_PAD * 2;
}

/** Width of the middle pile: its stacks, the indicator and the frame around them. */
export function pileWidth(stacks: number, tile: number): number {
  return (stacks + 1) * tile + 20;
}

/** Height of the middle pile with the count under it; `dense` is its tighter form for short screens. */
export function pileHeight(tile: number, dense = false): number {
  return Math.round(tile * 1.4) + (dense ? 30 : 46);
}

export type FeltLayout = {
  /**
   * 'cross': a table seen from above, each row in front of its player (left, across, right, you)
   * around the pile. 'crossFlat': the same, but your row lies beside the pile instead of under
   * it, which leaves room for readable tiles when the table is very low.
   * 'grid': two rows above the pile and two below, with narrow badges. 'stack': one row per line.
   */
  arrangement: 'cross' | 'crossFlat' | 'grid' | 'stack';
  /** Width of a discarded tile. */
  discardTile: number;
  /** How many face-down stacks the middle shows at most. */
  stacks: number;
};

export type FeltOptions = {
  /** Sideways table (the cross) or upright. */
  wide: boolean;
  /** The pile is drawn in its tighter form. */
  dense?: boolean;
  /** Size of an opponent's panel, which sits beside their row on the sideways table. */
  panelWidth?: number;
  panelHeight?: number;
  /** Discarded tiles are never larger than this. */
  maxDiscard?: number;
};

const GAP = 8;
const MIN_TILE = 12;
const MAX_STACKS = 8;
const MIN_STACKS = 3;
const widthFor = (rowWidth: number, badge: RowBadge) =>
  Math.floor((rowWidth - discardRowWidth(0, badge)) / DISCARDS_SHOWN);
const heightFor = (rowHeight: number) => Math.floor((rowHeight - TILE_FRAME - ROW_PAD * 2) / 1.4);

/**
 * Fits the pile and four rows of tiles into the felt's inner width and height.
 * `tile` is the pile's tile width.
 */
export function feltLayout(width: number, height: number, tile: number, options: FeltOptions): FeltLayout {
  const { wide, dense = false, panelWidth = 130, panelHeight = 34, maxDiscard = 34 } = options;
  const clamp = (n: number) => Math.max(MIN_TILE, Math.min(maxDiscard, n));
  const stacksIn = (room: number) => Math.max(MIN_STACKS, Math.min(MAX_STACKS, Math.floor((room - 20) / tile) - 1));

  if (wide) {
    // At each side: a panel with its row under it. In the centre: the panel and row of the
    // player across, then the pile, then your row, under the pile or beside it.
    const pile = pileHeight(tile, dense);
    const side = heightFor(height - panelHeight - GAP);
    const across = widthFor((width - 2 * GAP - panelWidth - GAP) / 3, 'none');
    const fit = (down: number, wide3: number) => clamp(Math.min(down, side, across, wide3));

    const cross = fit(heightFor((height - pile - 2 * GAP) / 2), across);

    // Beside the pile: the two lines are the row across and whichever is taller of pile and row.
    const line = (height - GAP) / 2 > pile ? (height - GAP) / 2 : height - GAP - pile;
    const lead = discardRowWidth(0, 'full') - discardRowWidth(0, 'none');
    const beside = widthFor((width - 3 * GAP - pileWidth(MIN_STACKS, tile) - lead) / 3, 'none');
    const flat = fit(heightFor(line), beside);

    if (flat > cross) {
      const centre = width - 2 * (discardRowWidth(flat, 'none') + GAP);
      return {
        arrangement: 'crossFlat',
        discardTile: flat,
        stacks: stacksIn(centre - GAP - discardRowWidth(flat, 'full')),
      };
    }
    const centre = width - 2 * (discardRowWidth(cross, 'none') + GAP);
    return { arrangement: 'cross', discardTile: cross, stacks: stacksIn(centre) };
  }

  // Upright: the rows go above and below the pile, either two to a line or one to a line,
  // whichever leaves the tiles bigger.
  const stacks = stacksIn(width);
  const spare = height - pileHeight(tile);
  const grid = clamp(Math.min(widthFor((width - GAP) / 2, 'compact'), heightFor((spare - 3 * GAP) / 2)));
  const stack = clamp(Math.min(widthFor(width, 'full'), heightFor((spare - 5 * GAP) / 4)));
  return stack > grid
    ? { arrangement: 'stack', discardTile: stack, stacks }
    : { arrangement: 'grid', discardTile: grid, stacks };
}

/** Columns the rack gets when the phone is sideways: enough room to sort a hand, no more. */
export const SIDEWAYS_RACK_COLS = 14;

/**
 * The sideways rack: 14 columns when they fit at (nearly) the tile size the height allows,
 * otherwise as few as 12, and the width and slot size that takes. `pad` is the rack's own
 * padding at each end.
 */
export function sidewaysRack(room: number, slot: number, pad: number): { cols: number; slot: number; width: number } {
  const inner = Math.max(0, room - pad * 2);
  const fitted = Math.floor(inner / SIDEWAYS_RACK_COLS);
  if (fitted >= slot * 0.8) {
    const size = Math.min(slot, fitted);
    return { cols: SIDEWAYS_RACK_COLS, slot: size, width: SIDEWAYS_RACK_COLS * size + pad * 2 };
  }
  const cols = Math.max(12, Math.min(SIDEWAYS_RACK_COLS, Math.floor(inner / slot)));
  const size = Math.min(slot, Math.floor(inner / cols));
  return { cols, slot: size, width: Math.min(room, cols * size + pad * 2) };
}
