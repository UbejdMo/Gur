import type { TileId } from '@gur/engine';

/**
 * A physical two-row rack. Each row has a fixed number of slots; a slot holds
 * one tile or is empty. Tiles side by side in a row form a group, and an empty
 * slot separates groups, exactly like on a real rack.
 */
export const ROWS = 2;
export const SLOTS_PER_ROW = 12;
export const SLOT_COUNT = ROWS * SLOTS_PER_ROW;

export type Layout = (TileId | null)[];

/** Dealt tiles: 7 in the top row, the rest in the bottom row, each row starting at its first slot. */
export function initialLayout(hand: readonly TileId[]): Layout {
  const layout: Layout = new Array<TileId | null>(SLOT_COUNT).fill(null);
  hand.slice(0, 7).forEach((t, i) => (layout[i] = t));
  hand.slice(7, 14).forEach((t, i) => (layout[SLOTS_PER_ROW + i] = t));
  return reconcile(layout, hand);
}

/** An empty slot with no tile on either side in its row, so a new tile doesn't join a group by accident. */
function freeSlot(layout: Layout): number {
  const empty = (s: number) => s >= 0 && s < SLOT_COUNT && layout[s] === null;
  const isolated = layout.findIndex(
    (_, s) =>
      empty(s) &&
      (s % SLOTS_PER_ROW === 0 || empty(s - 1)) &&
      (s % SLOTS_PER_ROW === SLOTS_PER_ROW - 1 || empty(s + 1)),
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
  const groups: TileId[][] = [];
  let current: TileId[] = [];
  layout.forEach((t, s) => {
    if (s % SLOTS_PER_ROW === 0 && current.length) {
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

/** Moves a tile to a slot. If the slot holds a tile, the two swap places. */
export function moveToSlot(layout: Layout, tile: TileId, slot: number): Layout {
  const from = layout.indexOf(tile);
  if (from === -1) throw new Error('That tile is not on the rack');
  if (slot < 0 || slot >= SLOT_COUNT) throw new Error('No such slot');
  const next = [...layout];
  next[from] = layout[slot] ?? null;
  next[slot] = tile;
  return next;
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
