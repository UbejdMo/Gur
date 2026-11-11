/**
 * Tiles, the joker, and tile values.
 *
 * 106 tiles: numbers 1-13 in four colours, two copies of each (104 tiles),
 * plus 2 printed jokers.
 *
 * Tile ids: copy * 52 + colourIndex * 13 + (number - 1) for numbered tiles,
 * 104 and 105 for the printed jokers.
 */

export const COLORS = ['red', 'yellow', 'blue', 'black'] as const;
export type Color = (typeof COLORS)[number];
export type TileId = number;

export interface Tile {
  id: TileId;
  /** null for a printed joker */
  color: Color | null;
  /** null for a printed joker */
  number: number | null;
  printedJoker: boolean;
}

export const TILE_COUNT = 106;
export const PRINTED_JOKER_IDS: readonly TileId[] = [104, 105];

export const TILES: readonly Tile[] = (() => {
  const tiles: Tile[] = [];
  for (let copy = 0; copy < 2; copy++) {
    COLORS.forEach((color, ci) => {
      for (let n = 1; n <= 13; n++) {
        tiles.push({ id: copy * 52 + ci * 13 + (n - 1), color, number: n, printedJoker: false });
      }
    });
  }
  for (const id of PRINTED_JOKER_IDS) tiles.push({ id, color: null, number: null, printedJoker: true });
  return tiles;
})();

export function getTile(id: TileId): Tile {
  const t = TILES[id];
  if (!t) throw new RangeError(`Unknown tile id ${id}`);
  return t;
}

export function tileId(color: Color, number: number, copy: 0 | 1 = 0): TileId {
  if (number < 1 || number > 13) throw new RangeError(`Tile number must be 1-13, got ${number}`);
  return copy * 52 + COLORS.indexOf(color) * 13 + (number - 1);
}

/** The joker identity for a round: one number above the indicator, same colour. After 13 comes 1. */
export interface Joker {
  color: Color;
  number: number;
}

export function jokerFromIndicator(indicator: TileId): Joker {
  const t = getTile(indicator);
  if (t.printedJoker) throw new Error('A printed joker cannot be the indicator; it must be redrawn');
  return { color: t.color!, number: t.number === 13 ? 1 : t.number! + 1 };
}

/**
 * How a tile behaves in this round.
 * - The real joker tiles (both copies of the joker identity) are wild.
 * - A printed joker is NOT wild: it counts as the joker identity tile.
 * - Every other tile is itself.
 */
export type Face = { wild: true } | { wild: false; color: Color; number: number };

export function isRealJoker(id: TileId, joker: Joker): boolean {
  const t = getTile(id);
  return !t.printedJoker && t.color === joker.color && t.number === joker.number;
}

export function faceOf(id: TileId, joker: Joker): Face {
  const t = getTile(id);
  if (t.printedJoker) return { wild: false, color: joker.color, number: joker.number };
  if (isRealJoker(id, joker)) return { wild: true };
  return { wild: false, color: t.color!, number: t.number! };
}

/** Points a tile is worth when left unconnected: its face value; a joker or printed joker counts the joker's number. */
export function tileValue(id: TileId, joker: Joker): number {
  const t = getTile(id);
  if (t.printedJoker) return joker.number;
  return t.number!;
}

/** Physical identity, used to find identical pairs for the restart offer. */
export function physicalKey(id: TileId): string {
  const t = getTile(id);
  return t.printedJoker ? 'printed-joker' : `${t.color}-${t.number}`;
}

export function describeTile(id: TileId): string {
  const t = getTile(id);
  return t.printedJoker ? 'printed joker' : `${t.color} ${t.number}`;
}
