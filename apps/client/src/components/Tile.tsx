import { StyleSheet, Text, View } from 'react-native';
import { describeTile, getTile } from '@gur/engine';
import type { TileId } from '@gur/engine';
import { colors, tileInk } from '@/theme';

type Props = {
  id: TileId;
  /** Marks the real joker tiles for this round. */
  wild?: boolean;
  size?: 'small' | 'regular';
};

export function Tile({ id, wild = false, size = 'regular' }: Props) {
  const tile = getTile(id);
  const small = size === 'small';
  const label = wild ? `${describeTile(id)}, joker` : describeTile(id);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID="tile"
      style={[styles.tile, small && styles.small, wild && styles.wild]}
    >
      {tile.printedJoker ? (
        <Text style={[styles.star, small && styles.starSmall]}>★</Text>
      ) : (
        <Text style={[styles.number, small && styles.numberSmall, { color: tileInk[tile.color!] }]}>{tile.number}</Text>
      )}
      <View style={[styles.dot, small && styles.dotSmall]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 40,
    height: 56,
    borderRadius: 6,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: colors.tileEdge,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 6,
  },
  small: { width: 32, height: 44, paddingTop: 4, paddingBottom: 4 },
  wild: { borderColor: colors.accent, borderWidth: 2 },
  number: { fontSize: 22, fontWeight: '800' },
  numberSmall: { fontSize: 17 },
  star: { fontSize: 22, color: colors.accent },
  starSmall: { fontSize: 17 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.tileEdge },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
});
