import { moveTile } from '@/game/rack';

describe('moveTile', () => {
  const groups = [[1, 2, 3], [4], [5, 6]];

  it('puts a tile right after another, joining its group', () => {
    expect(moveTile(groups, 4, { after: 2 })).toEqual([
      [1, 2, 4, 3],
      [5, 6],
    ]);
  });

  it('starts a new group at the end', () => {
    expect(moveTile(groups, 2, { newGroup: true })).toEqual([[1, 3], [4], [5, 6], [2]]);
  });

  it('leaves the rack unchanged when moving a tile after itself', () => {
    expect(moveTile(groups, 2, { after: 2 })).toEqual(groups);
  });

  it('never loses or duplicates a tile', () => {
    const moved = moveTile(moveTile(groups, 6, { after: 1 }), 1, { after: 5 });
    expect(moved.flat().sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rejects tiles that are not on the rack', () => {
    expect(() => moveTile(groups, 9, { newGroup: true })).toThrow();
    expect(() => moveTile(groups, 1, { after: 9 })).toThrow();
  });
});
