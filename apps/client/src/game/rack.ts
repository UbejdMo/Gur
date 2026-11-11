import type { TileId } from '@gur/engine';

export type MoveTarget = { after: TileId } | { newGroup: true };

/**
 * Moves one tile within a rack: right after another tile (joining its group),
 * or into a new group at the end. The player decides every move; nothing is
 * rearranged automatically.
 */
export function moveTile(groups: readonly TileId[][], tile: TileId, target: MoveTarget): TileId[][] {
  if (!groups.some((g) => g.includes(tile))) throw new Error('That tile is not on the rack');
  if ('after' in target && target.after === tile) return groups.map((g) => [...g]);
  const without = groups.map((g) => g.filter((t) => t !== tile));
  if ('newGroup' in target) {
    return [...without.filter((g) => g.length > 0), [tile]];
  }
  const result = without.map((g) => {
    const i = g.indexOf(target.after);
    return i === -1 ? g : [...g.slice(0, i + 1), tile, ...g.slice(i + 1)];
  });
  if (!result.some((g) => g.includes(tile))) throw new Error('The target tile is not on the rack');
  return result.filter((g) => g.length > 0);
}
