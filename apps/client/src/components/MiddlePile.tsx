import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TileId } from '@gur/engine';
import { Tile } from './Tile';
import { colors } from '@/theme';

type Props = {
  count: number;
  indicator: TileId;
  canDraw: boolean;
  onDraw: () => void;
  /** Width of one tile in the row. */
  tileWidth: number;
};

/**
 * The middle: a row of face-down stacks with the indicator turned face up at the end.
 * Tap it to draw when it's your turn.
 */
export function MiddlePile({ count, indicator, canDraw, onDraw, tileWidth }: Props) {
  const stacks = Math.max(1, Math.min(8, Math.ceil(count / 6)));
  const h = Math.round(tileWidth * 1.4);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Draw from the middle, ${count} tiles left`}
        accessibilityState={{ disabled: !canDraw }}
        testID="draw-middle"
        onPress={() => canDraw && onDraw()}
        style={[styles.row, canDraw && styles.active]}
      >
        {Array.from({ length: stacks }, (_, i) => (
          <View key={i} style={[styles.stack, { width: tileWidth, height: h + 6 }]}>
            <View style={[styles.layer, { width: tileWidth, height: h, top: 6 }]} />
            <View style={[styles.layer, { width: tileWidth, height: h, top: 3 }]} />
            <View style={[styles.back, { width: tileWidth, height: h }]} />
          </View>
        ))}
        <View style={styles.indicator}>
          <Tile id={indicator} width={tileWidth} testID="indicator" />
        </View>
      </Pressable>
      <Text style={styles.count}>
        <Text testID="middle-count">{count}</Text> tiles in the middle
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  active: { borderColor: colors.accent },
  stack: { marginRight: -2 },
  layer: {
    position: 'absolute',
    left: 0,
    borderRadius: 5,
    backgroundColor: colors.tileEdge,
    borderWidth: 1,
    borderColor: '#BDB3A0',
  },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 5,
    backgroundColor: colors.tileBack,
    borderWidth: 1,
    borderColor: colors.tileEdge,
  },
  indicator: { marginLeft: 4 },
  count: { color: colors.textMuted, fontSize: 12 },
});
