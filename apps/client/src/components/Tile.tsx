import { Pressable, StyleSheet, Text, View } from 'react-native';
import { describeTile, getTile } from '@gur/engine';
import type { TileId } from '@gur/engine';
import { colors, tileInk } from '@/theme';

type Props = {
  id: TileId;
  /** Marks the real joker tiles for this round. */
  wild?: boolean;
  size?: 'small' | 'regular';
  selected?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  testID?: string;
  disabled?: boolean;
  /** Exact width in points, for racks that size tiles to fit the screen. Height follows. */
  width?: number;
};

export function Tile({
  id,
  wild = false,
  size = 'regular',
  selected = false,
  onPress,
  onPressIn,
  testID = 'tile',
  disabled,
  width,
}: Props) {
  const tile = getTile(id);
  const small = size === 'small';
  const label = wild ? `${describeTile(id)}, joker` : describeTile(id);

  const sized = width
    ? {
        box: { width, height: Math.round(width * 1.4), paddingTop: width * 0.12, paddingBottom: width * 0.12 },
        text: { fontSize: Math.round(width * 0.55) },
        dot: { width: width * 0.18, height: width * 0.18, borderRadius: width * 0.09 },
      }
    : null;

  const face = (
    <>
      {tile.printedJoker ? (
        <Text selectable={false} style={[styles.star, small && styles.starSmall, sized?.text]}>
          ★
        </Text>
      ) : (
        <Text
          selectable={false}
          style={[styles.number, small && styles.numberSmall, sized?.text, { color: tileInk[tile.color!] }]}
        >
          {tile.number}
        </Text>
      )}
      <View style={[styles.dot, small && styles.dotSmall, sized?.dot]} />
    </>
  );
  const style = [styles.tile, small && styles.small, sized?.box, wild && styles.wild, selected && styles.selected];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        aria-selected={selected}
        testID={testID}
        onPress={onPress}
        onPressIn={onPressIn}
        disabled={disabled}
        style={style}
      >
        {face}
      </Pressable>
    );
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID={testID} style={style}>
      {face}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    // Tiles are picked up and dragged: their numbers must never start a text selection.
    userSelect: 'none',
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
  selected: { transform: [{ translateY: -10 }], borderColor: colors.selected, borderWidth: 3 },
  number: { fontSize: 22, fontWeight: '800' },
  numberSmall: { fontSize: 17 },
  star: { fontSize: 22, color: colors.accent },
  starSmall: { fontSize: 17 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.tileEdge },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
});
