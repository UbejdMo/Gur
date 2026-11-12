import type { TileId } from '@gur/engine';

/**
 * A physical two-row rack. Each row has the same number of slots; a slot holds
 * one tile or is empty. Tiles side by side in a row form a group, and an empty
 * slot separates groups, exactly like on a real rack.
 *
 * The rack is as wide as the screen allows: a layout is a flat list of
 * ROWS x columns slots, so its length says how many columns it has.
 */
export const ROWS = 2;
/** The narrowest rack (a phone held upright). Wider screens get more columns. */
export const MIN_COLS = 12;
export const MAX_COLS = 24;

export type Layout = (TileId | null)[];
/** Which half of a tile something was dropped on. */
export type Side = 'left' | 'right';

export function colsOf(layout: Layout): number {
  return layout.length / ROWS;
}

function emptyLayout(cols: number): Layout {
  return new Array<TileId | null>(ROWS * cols).fill(null);
}

/** Dealt tiles: 7 in the top row, the rest in the bottom row, each row starting at its first slot. */
export function initialLayout(hand: readonly TileId[], cols = MIN_COLS): Layout {
  const layout = emptyLayout(cols);
  hand.slice(0, 7).forEach((t, i) => (layout[i] = t));
  hand.slice(7, 14).forEach((t, i) => (layout[cols + i] = t));
  return reconcile(layout, hand);
}

/** An empty slot with no tile on either side in its row, so a new tile doesn't join a group by accident. */
function freeSlot(layout: Layout): number {
  const cols = colsOf(layout);
  const empty = (s: number) => layout[s] === null;
  const isolated = layout.findIndex(
    (_, s) => empty(s) && (s % cols === 0 || empty(s - 1)) && (s % cols === cols - 1 || empty(s + 1)),
  );
  return isolated !== -1 ? isolated : layout.findIndex((t) => t === null);
}

/** Keeps the layout in step with the hand: tiles that left are removed, new tiles go into a free slot. */
export function reconcile(layout: Layout, hand: readonly TileId[]): Layout {
  const inHand = new Set(hand);
  const next = layout.map((t) => (t !== null && inHand.has(t) ? t : null));
  for (const t of hand) {
    if (next.includes(t)) continue;
    const slot = freeSlot(next);
    if (slot === -1) throw new Error('The rack is full');
    next[slot] = t;
  }
  return next;
}

/** Groups are runs of tiles side by side in a row. */
export function layoutGroups(layout: Layout): TileId[][] {
  const cols = colsOf(layout);
  const groups: TileId[][] = [];
  let current: TileId[] = [];
  layout.forEach((t, s) => {
    if (s % cols === 0 && current.length) {
      groups.push(current);
      current = [];
    }
    if (t === null) {
      if (current.length) groups.push(current);
      current = [];
    } else {
      current.push(t);
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Puts a tile on a slot. The tile may already be on the rack (a move) or be new (just drawn).
 *
 * An empty slot simply takes it. Dropped on another tile, it is inserted next to that tile
 * (on the side it was dropped on) and the neighbours shift along to make room; nothing swaps.
 * At the end of a row, where there is no room on that side, the tiles shift the other way.
 */
export function placeTile(layout: Layout, tile: TileId, slot: number, side: Side = 'left'): Layout {
  if (slot < 0 || slot >= layout.length || !Number.isInteger(slot)) throw new Error('No such slot');
  const cols = colsOf(layout);
  const from = layout.indexOf(tile);
  if (from === slot) return layout;
  const next = [...layout];
  if (from !== -1) next[from] = null;
  if (next[slot] === null) {
    next[slot] = tile;
    return next;
  }

  const rowStart = slot - (slot % cols);
  const rowEnd = rowStart + cols;
  // The gap the tile goes into is just before `want`.
  const want = side === 'left' ? slot : slot + 1;

  /** Shifts the tiles from `want` rightwards into the nearest empty slot, and takes `want`. */
  const pushRight = (): boolean => {
    let e = want;
    while (e < rowEnd && next[e] !== null) e++;
    if (e >= rowEnd) return false;
    for (let s = e; s > want; s--) next[s] = next[s - 1]!;
    next[want] = tile;
    return true;
  };
  /** Shifts the tiles before `want` leftwards into the nearest empty slot, and takes `want - 1`. */
  const pushLeft = (): boolean => {
    let e = want - 1;
    while (e >= rowStart && next[e] !== null) e--;
    if (e < rowStart) return false;
    for (let s = e; s < want - 1; s++) next[s] = next[s + 1]!;
    next[want - 1] = tile;
    return true;
  };

  // Moving a tile along its own group: close the gap it left behind instead of pushing the far side.
  const fromLeftInSameGroup =
    from !== -1 && from >= rowStart && from < slot && layout.slice(from, slot).every((t) => t !== null);
  if (fromLeftInSameGroup ? pushLeft() || pushRight() : pushRight() || pushLeft()) return next;

  // The row is full: nothing can shift, so the two tiles trade places (or a new tile goes to a free slot).
  if (from !== -1) {
    next[from] = layout[slot]!;
    next[slot] = tile;
  } else {
    const free = freeSlot(next);
    if (free === -1) throw new Error('The rack is full');
    next[free] = tile;
  }
  return next;
}

/**
 * Changes how many columns the rack has (the screen was resized or turned).
 * Tiles stay where they are when they still fit; otherwise the groups are packed
 * together, kept apart by one empty slot whenever there is room.
 */
export function resizeLayout(layout: Layout, cols: number): Layout {
  const old = colsOf(layout);
  if (cols === old) return layout;
  if (ROWS * cols < layout.filter((t) => t !== null).length) throw new Error('The rack is too small');
  const rows = Array.from({ length: ROWS }, (_, r) => layout.slice(r * old, (r + 1) * old));

  if (rows.every((row) => row.slice(cols).every((t) => t === null))) {
    return rows.flatMap((row) => Array.from({ length: cols }, (_, c) => row[c] ?? null));
  }

  // Pack the groups in order, a row at a time, with one empty slot between them.
  const next = emptyLayout(cols);
  let row = 0;
  let col = 0;
  let fits = true;
  for (const group of layoutGroups(layout)) {
    if (col > 0 && col + 1 + group.length > cols) {
      row++;
      col = 0;
    }
    if (col > 0) col++;
    if (row >= ROWS || group.length > cols) {
      fits = false;
      break;
    }
    group.forEach((t, i) => (next[row * cols + col + i] = t));
    col += group.length;
  }
  if (fits) return next;

  // Too tight even for that: fill the slots in order.
  const tight = emptyLayout(cols);
  layout.filter((t) => t !== null).forEach((t, i) => (tight[i] = t));
  return tight;
}

/** Same groups regardless of order: used to keep the engine's arrangement in step with the rack. */
export function sameGroups(a: readonly TileId[][], b: readonly TileId[][]): boolean {
  const key = (gs: readonly TileId[][]) =>
    gs
      .map((g) => [...g].sort((x, y) => x - y).join(','))
      .sort()
      .join('|');
  return key(a) === key(b);
}
