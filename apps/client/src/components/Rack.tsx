import { Pressable, StyleSheet, Text, View } from 'react-native';
import { faceOf, isMeld, isRealJoker } from '@gur/engine';
import type { Joker, TileId } from '@gur/engine';
import { Tile } from './Tile';
import type { MoveTarget } from '@/game/rack';
import { colors } from '@/theme';

type Props = {
  groups: TileId[][];
  joker: Joker;
  aceHigh: boolean;
  selected: TileId | null;
  onSelect: (tile: TileId) => void;
  onMove: (target: MoveTarget) => void;
};

/**
 * Your rack. Tap a tile to pick it up; tap another tile to put it right after
 * that one, or tap + to start a new group. Groups that form a meld are outlined
 * in green: only those count as connected when someone closes.
 */
export function Rack({ groups, joker, aceHigh, selected, onSelect, onMove }: Props) {
  return (
    <View style={styles.rack} testID="rack">
      {groups.map((group) => {
        const meld = isMeld(
          group.map((t) => faceOf(t, joker)),
          aceHigh,
        );
        return (
          <View
            key={group.join('-')}
            style={[styles.group, meld && styles.meld]}
            testID={meld ? 'rack-meld' : 'rack-group'}
          >
            {group.map((tile) => (
              <Tile
                key={tile}
                id={tile}
                testID="rack-tile"
                wild={isRealJoker(tile, joker)}
                selected={selected === tile}
                onPress={() => (selected === null || selected === tile ? onSelect(tile) : onMove({ after: tile }))}
              />
            ))}
          </View>
        );
      })}
      {selected !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New group"
          onPress={() => onMove({ newGroup: true })}
          style={styles.newGroup}
        >
          <Text style={styles.newGroupText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    columnGap: 10,
    rowGap: 14,
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.rack,
    borderBottomWidth: 6,
    borderBottomColor: colors.rackEdge,
    width: '100%',
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '100%',
    gap: 2,
    rowGap: 12,
    padding: 2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meld: { borderColor: colors.meld },
  newGroup: {
    width: 40,
    height: 56,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newGroupText: { fontSize: 26, color: colors.tile, fontWeight: '700' },
});
