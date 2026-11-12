import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TileId } from '@gur/engine';
import { DragSource } from './DragSource';
import { Tile } from './Tile';
import { colors } from '@/theme';

type Props = {
  count: number;
  indicator: TileId;
  canDraw: boolean;
  onDraw: () => void;
  /** The top tile was dragged and let go at this point on the screen. */
  onDropAt: (pageX: number, pageY: number) => void;
  onDragChange?: (dragging: boolean) => void;
  /** Width of one tile in the row. */
  tileWidth: number;
  /** The most face-down stacks there is room for. */
  maxStacks?: number;
  /** Less padding, for very short screens. */
  dense?: boolean;
};

/**
 * The middle: a row of face-down stacks with the indicator turned face up at the end.
 * Tap it to draw when it's your turn, or drag the tile next to the indicator onto your rack.
 */
export function MiddlePile({
  count,
  indicator,
  canDraw,
  onDraw,
  onDropAt,
  onDragChange,
  tileWidth,
  maxStacks = 8,
  dense = false,
}: Props) {
  const stacks = Math.max(1, Math.min(maxStacks, Math.ceil(count / 6)));
  const h = Math.round(tileWidth * 1.4);
  return (
    <View style={[styles.wrap, dense && styles.wrapDense]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Draw from the middle, ${count} tiles left`}
        accessibilityState={{ disabled: !canDraw }}
        testID="draw-middle"
        onPress={() => canDraw && onDraw()}
        style={[styles.row, dense && styles.rowDense, canDraw && styles.active]}
      >
        {Array.from({ length: stacks }, (_, i) => {
          const stack = (
            <View key={i} style={[styles.stack, { width: tileWidth, height: h + 6 }]}>
              <View style={[styles.layer, { width: tileWidth, height: h, top: 6 }]} />
              <View style={[styles.layer, { width: tileWidth, height: h, top: 3 }]} />
              <View style={[styles.back, { width: tileWidth, height: h }]} />
            </View>
          );
          // The stack beside the indicator is the one you draw from: it can be dragged to the rack.
          return i === stacks - 1 ? (
            <DragSource key={i} enabled={canDraw} onTap={onDraw} onDrop={onDropAt} onDragChange={onDragChange}>
              {stack}
            </DragSource>
          ) : (
            stack
          );
        })}
        <View style={styles.indicator}>
          <Tile id={indicator} width={tileWidth} testID="indicator" />
        </View>
      </Pressable>
      <Text style={[styles.count, dense && styles.countDense]}>
        <Text testID="middle-count">{count}</Text> tiles in the middle
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  wrapDense: { gap: 1 },
  rowDense: { padding: 3 },
  countDense: { fontSize: 10 },
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
