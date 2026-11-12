import { StyleSheet, Text, View } from 'react-native';
import { isRealJoker } from '@gur/engine';
import type { Joker, TileId } from '@gur/engine';
import { DragSource } from './DragSource';
import { Tile } from './Tile';
import { colors } from '@/theme';

/** How many discarded tiles stay in view. */
export const DISCARDS_SHOWN = 6;

type Props = {
  /** Every discarded tile still on the table, oldest first. */
  discards: readonly TileId[];
  /** The tile the player to move may still take, if any: always the newest one. */
  last: TileId | null;
  /** It is your turn to draw, so you may take the last tile. */
  takeable: boolean;
  joker: Joker;
  tileWidth: number;
  onTake: () => void;
  /** The last tile was dragged and let go at this point on the screen. */
  onDropAt: (pageX: number, pageY: number) => void;
  onDragChange?: (dragging: boolean) => void;
};

/**
 * The discarded tiles everyone can see: the latest six, oldest on the left. Only the newest
 * can be picked up, only by the next player and only on that turn; after that it is gone for
 * good and stays here, dimmed, so players can see which tiles are out of the game.
 */
export function DiscardRow({ discards, last, takeable, joker, tileWidth, onTake, onDropAt, onDragChange }: Props) {
  const shown = discards.slice(-DISCARDS_SHOWN);
  const gap = 3;
  const h = Math.round(tileWidth * 1.4);
  return (
    <View style={styles.wrap} testID="discards">
      <Text style={styles.label}>Discarded</Text>
      {/* Always six tiles wide, so the table doesn't shift as tiles arrive. */}
      <View
        style={[
          styles.row,
          { gap, width: DISCARDS_SHOWN * (tileWidth + 4) + (DISCARDS_SHOWN - 1) * gap + 8, height: h + 10 },
        ]}
      >
        {shown.length === 0 && <Text style={styles.none}>none yet</Text>}
        {shown.map((id) =>
          id === last ? (
            <DragSource key={id} enabled={takeable} onTap={onTake} onDrop={onDropAt} onDragChange={onDragChange}>
              <View style={[styles.frame, takeable && styles.takeable]}>
                <Tile
                  id={id}
                  width={tileWidth}
                  testID="last-discard"
                  wild={isRealJoker(id, joker)}
                  onPress={() => takeable && onTake()}
                />
              </View>
            </DragSource>
          ) : (
            <View key={id} style={[styles.frame, styles.gone]}>
              <Tile id={id} width={tileWidth} testID="gone-discard" wild={isRealJoker(id, joker)} />
            </View>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.feltEdge,
  },
  none: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 11 },
  frame: { borderRadius: 7, borderWidth: 2, borderColor: 'transparent' },
  takeable: { borderColor: colors.accent },
  // Tiles that can no longer be picked up.
  gone: { opacity: 0.55 },
});
