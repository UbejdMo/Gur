import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { handOf, isRealJoker, tileId } from '@gur/engine';
import { MiddlePile } from './MiddlePile';
import { PlayerPanel } from './PlayerPanel';
import { Rack } from './Rack';
import { ResultsOverlay } from './ResultsOverlay';
import { Tile } from './Tile';
import { PLAYER_NAMES, YOU, usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';
import { colors } from '@/theme';

type Props = PracticeOptions & { onMenu: () => void };

/** Where each seat's last discard lies on the felt: next to the player who discarded it. */
const DISCARD_SPOT = [
  { bottom: 12, right: 14 }, // you
  { top: 12, right: 14 }, // right
  { top: 12, left: 14 }, // across
  { bottom: 12, left: 14 }, // left: the tile you can take
] as const;

/**
 * The practice table: a felt table in the middle, players on both sides, your rack below.
 * Play runs counter-clockwise: you, the player on your right, the one across, the one on your left.
 *
 * Buttons here are never given `disabled`: a button that disables itself in the middle of its
 * own press leaves the web responder stuck, which stops the next drag. They ignore presses
 * that aren't allowed instead, and still report "disabled" to screen readers.
 */
export function Table({ onMenu, ...options }: Props) {
  const p = usePracticeGame(options);
  const { game } = p;
  const { round } = game;
  const playing = game.status === 'playing';
  const { width, height } = useWindowDimensions();
  const wide = width >= 700 && width > height;

  const status = !playing
    ? 'Round over'
    : !p.yourTurn
      ? `${PLAYER_NAMES[round.current]} is playing…`
      : round.phase === 'draw'
        ? 'Your turn: draw from the middle or take the last discard'
        : p.canClose
          ? 'You can close! Drag your extra tile up, or press Close'
          : p.selected === null
            ? 'Drag a tile up off your rack to discard it'
            : 'Discard it, or tap a slot to move it there';

  const short = height < 560;

  // Sizes come from the screen: the rack gets about 45% of the height in landscape (two rows
  // of tiles 1.4 times as tall as wide, plus the planks), the felt shows smaller tiles.
  const rackMaxSlot = Math.max(24, Math.min(64, Math.floor((height * (wide ? 0.45 : 0.3) - 76) / 2.8) + 2));
  const feltTile = wide ? Math.max(22, Math.min(44, Math.floor(height / 18))) : 24;

  const panel = (seat: number, compact = false) => (
    <PlayerPanel
      name={PLAYER_NAMES[seat]!}
      tileCount={handOf(game.players[seat]!).length}
      points={game.players[seat]!.total}
      isTurn={playing && round.current === seat}
      you={seat === YOU}
      secondsLeft={seat === YOU ? p.secondsLeft : undefined}
      compact={compact}
      small={wide && short}
    />
  );

  const felt = (
    <View style={[styles.felt, wide ? styles.feltWide : styles.feltNarrow]}>
      <MiddlePile
        count={round.middle.length}
        indicator={round.indicator}
        canDraw={p.yourTurn && round.phase === 'draw'}
        onDraw={p.drawMiddle}
        tileWidth={feltTile}
      />
      {round.lastDiscard && (
        <View style={[styles.discard, DISCARD_SPOT[round.lastDiscard.by]]}>
          <View style={p.lastDiscardTakeable && styles.takeable}>
            <Tile
              id={round.lastDiscard.tile}
              width={feltTile + 6}
              testID="last-discard"
              wild={isRealJoker(round.lastDiscard.tile, round.joker)}
              onPress={() => p.lastDiscardTakeable && p.takeDiscard()}
            />
          </View>
        </View>
      )}
      {p.canDiscardNow && <Text style={styles.feltHint}>Drag a tile up to play it</Text>}
    </View>
  );

  const statusPanel = (
    <View style={styles.statusPanel}>
      {p.log && (
        <Text style={styles.log} numberOfLines={2} testID="log">
          {p.log}
        </Text>
      )}
      <Text style={[styles.status, p.canClose && styles.statusClose]} testID="status" accessibilityLiveRegion="polite">
        {status}
      </Text>
      {p.message && (
        <Text style={styles.message} testID="message">
          {p.message}
        </Text>
      )}
    </View>
  );

  const controls = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !p.canDiscard }}
        onPress={() => p.canDiscard && p.discard()}
        style={[styles.button, !p.canDiscard && styles.dim]}
      >
        <Text style={styles.buttonText}>Discard</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !p.canClose }}
        onPress={() => p.canClose && p.close()}
        style={[styles.button, styles.closeButton, !p.canClose && styles.dim, p.canClose && styles.closeReady]}
      >
        <Text style={styles.buttonText}>Close</Text>
      </Pressable>
      <View style={styles.jokerBox} accessibilityLabel={`Joker: ${round.joker.color} ${round.joker.number}`}>
        <Text style={styles.jokerLabel}>JOKER</Text>
        <Tile id={tileId(round.joker.color, round.joker.number)} width={wide ? 30 : 24} testID="joker-tile" />
        <Text style={styles.hidden} testID="joker">
          {round.joker.color} {round.joker.number}
        </Text>
      </View>
    </>
  );

  const rack = (
    <Rack
      layout={p.layout}
      joker={round.joker}
      aceHigh={game.settings.aceHigh}
      selected={p.selected}
      onSelect={p.select}
      onMoveSelected={p.moveSelected}
      onDrop={p.drop}
      onDropUp={p.dropUp}
      maxSlot={rackMaxSlot}
    />
  );

  return (
    <View style={styles.screen}>
      {wide ? (
        <View style={[styles.wideContent, short && styles.wideShort]}>
          <View style={styles.tableRow}>
            <View style={styles.side}>
              {panel(2)}
              {panel(3)}
            </View>
            {felt}
            <View style={styles.side}>
              {panel(1)}
              {panel(YOU)}
            </View>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.grow}>{statusPanel}</View>
            {controls}
          </View>
          {rack}
        </View>
      ) : (
        <View style={styles.narrowContent}>
          <View style={styles.panelRow}>
            {panel(3, true)}
            {panel(2, true)}
            {panel(1, true)}
          </View>
          {felt}
          {statusPanel}
          <View style={styles.statusRow}>
            <View style={styles.youCell}>{panel(YOU)}</View>
            {controls}
          </View>
          {rack}
        </View>
      )}

      {game.status !== 'playing' && <ResultsOverlay game={game} onPlayAgain={p.playAgain} onMenu={onMenu} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backdrop },
  wideContent: { flex: 1, padding: 16, gap: 12, width: '100%', maxWidth: 1280, alignSelf: 'center' },
  wideShort: { padding: 8, gap: 6 },
  narrowContent: { flex: 1, padding: 10, gap: 10 },
  tableRow: { flex: 1, flexDirection: 'row', gap: 10, minHeight: 0 },
  side: { justifyContent: 'space-between', gap: 8 },
  panelRow: { flexDirection: 'row', gap: 8 },
  youCell: { flex: 1 },
  felt: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.felt,
    borderRadius: 24,
    borderWidth: 8,
    borderColor: colors.feltRim,
    padding: 8,
    overflow: 'hidden',
  },
  feltWide: { flex: 1 },
  feltNarrow: { flex: 1, minHeight: 170 },
  discard: { position: 'absolute' },
  takeable: { borderRadius: 8, borderWidth: 3, borderColor: colors.accent },
  feltHint: { position: 'absolute', bottom: 10, color: colors.textMuted, fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  grow: { flex: 1, justifyContent: 'center' },
  statusPanel: {
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.backdropPanel,
    borderWidth: 1,
    borderColor: colors.panelEdge,
    gap: 2,
  },
  log: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  status: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  statusClose: { color: colors.accent },
  message: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  button: { justifyContent: 'center', backgroundColor: colors.accent, paddingHorizontal: 14, borderRadius: 10 },
  closeButton: { backgroundColor: colors.meld },
  closeReady: { borderWidth: 3, borderColor: colors.text },
  dim: { opacity: 0.35 },
  buttonText: { fontSize: 14, fontWeight: '800', color: '#2A2A2A' },
  jokerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.jokerBox,
  },
  jokerLabel: { color: colors.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
