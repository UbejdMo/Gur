import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { handOf, tileId } from '@gur/engine';
import { DiscardRow } from './DiscardRow';
import { MiddlePile } from './MiddlePile';
import { PlayerPanel } from './PlayerPanel';
import { Rack } from './Rack';
import type { RackHandle } from './Rack';
import { ResultsOverlay } from './ResultsOverlay';
import { Tile } from './Tile';
import { PLAYER_NAMES, YOU, usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';
import { colors } from '@/theme';

type Props = PracticeOptions & { onMenu: () => void };

/**
 * The practice table: a felt table in the middle, players on both sides, your rack below.
 * Play runs counter-clockwise: you, the player on your right, the one across, the one on your left.
 *
 * The felt shows the middle and the last six discarded tiles. The newest discard and the top of
 * the middle can be tapped, or dragged onto the rack to land exactly where you want them.
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
  // While a tile from the table is in the air, the table is lifted above the rack so it stays in view.
  const [lifted, setLifted] = useState(false);
  const rackRef = useRef<RackHandle>(null);
  const { drawMiddle, takeDiscard } = p;
  // A tile let go over the rack lands on that slot; let go anywhere else, it goes back.
  const dropOnRack = useMemo(
    () => ({
      middle: (x: number, y: number) => rackRef.current?.locate(x, y, (place) => place && drawMiddle(place)),
      discard: (x: number, y: number) => rackRef.current?.locate(x, y, (place) => place && takeDiscard(place)),
    }),
    [drawMiddle, takeDiscard],
  );

  const status = !playing
    ? 'Round over'
    : !p.yourTurn
      ? `${PLAYER_NAMES[round.current]} is playing…`
      : round.phase === 'draw'
        ? 'Your turn: draw from the middle or take the last discard (tap or drag)'
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
    <View
      style={[styles.felt, wide ? styles.feltWide : styles.feltNarrow, !wide && lifted && styles.lifted]}
      testID="felt"
    >
      <MiddlePile
        count={round.middle.length}
        indicator={round.indicator}
        canDraw={p.yourTurn && round.phase === 'draw'}
        onDraw={drawMiddle}
        onDropAt={dropOnRack.middle}
        onDragChange={setLifted}
        tileWidth={feltTile}
      />
      <DiscardRow
        discards={round.discards}
        last={round.lastDiscard?.tile ?? null}
        takeable={p.lastDiscardTakeable}
        joker={round.joker}
        tileWidth={feltTile + 4}
        onTake={takeDiscard}
        onDropAt={dropOnRack.discard}
        onDragChange={setLifted}
      />
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
      {/* Close only appears once the rack shows a closing hand: every tile connected, one to spare. */}
      {p.canClose && (
        <Pressable accessibilityRole="button" onPress={() => p.close()} style={[styles.button, styles.closeButton]}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      )}
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
      ref={rackRef}
      layout={p.layout}
      joker={round.joker}
      aceHigh={game.settings.aceHigh}
      selected={p.selected}
      onSelect={p.select}
      onMoveSelected={p.moveSelected}
      onDrop={p.drop}
      onDropUp={p.dropUp}
      maxSlot={rackMaxSlot}
      onResize={p.resize}
    />
  );

  return (
    <View style={styles.screen}>
      {wide ? (
        <View style={[styles.wideContent, short && styles.wideShort]}>
          <View style={[styles.tableRow, lifted && styles.lifted]}>
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
  },
  // Side by side on a wide table; wraps to two lines if the felt is too narrow for both.
  feltWide: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 6, alignContent: 'center' },
  feltNarrow: { flex: 1, minHeight: 190, gap: 12 },
  lifted: { zIndex: 20, elevation: 20 },
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
  closeButton: { backgroundColor: colors.meld, borderWidth: 3, borderColor: colors.text },
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
