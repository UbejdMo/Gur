import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { handOf, tileId } from '@gur/engine';
import { DiscardRow } from './DiscardRow';
import { FullscreenButton } from './FullscreenButton';
import { MiddlePile } from './MiddlePile';
import { PlayerPanel } from './PlayerPanel';
import { RACK_PAD, Rack } from './Rack';
import type { RackHandle } from './Rack';
import { ResultsOverlay } from './ResultsOverlay';
import { Tile } from './Tile';
import { SIDEWAYS_RACK_COLS, feltLayout, sidewaysRack } from '@/game/feltLayout';
import { PLAYER_NAMES, YOU, usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';
import { colors } from '@/theme';

type Props = PracticeOptions & { onMenu: () => void };

/**
 * The practice table. Play runs counter-clockwise: you, the player on your right, the one
 * across, the one on your left.
 *
 * Sideways, the felt is a table seen from above and takes the full width: the three bots sit
 * at its left, far and right edges, the pile is in the centre, and your rack lies below with
 * your own panel, the status and the buttons at its two ends. Upright, the bots are in a line
 * on top and everything is stacked.
 *
 * In front of each player lie the last six tiles left for them: the ones the player before
 * them discarded. So a tile you discard lands in front of the player on your right, and the
 * tiles in front of you are the ones you were offered. The newest discard and the top of
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
  // The game uses the whole screen, so it keeps clear of a notch or rounded corners itself.
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = screen.width - insets.left - insets.right;
  const height = screen.height - insets.top - insets.bottom;
  const wide = width >= 560 && width > height;
  // While a tile from the table is in the air, the table is lifted above the rack so it stays in view.
  const [lifted, setLifted] = useState(false);
  const [feltSize, setFeltSize] = useState<{ width: number; height: number } | null>(null);
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
  // A phone held sideways: 300 to 400 points of height (less inside a browser, where the
  // address bar takes its share), so everything around the rack is squeezed to the minimum.
  const tight = wide && height < 420;

  // Sizes come from the screen: the rack gets about 45% of the height in landscape (two rows
  // of tiles 1.4 times as tall as wide, plus the planks), the felt shows smaller tiles.
  // On a phone held sideways the slots are at least 28 points wide whenever that still leaves
  // the felt the height it needs (about 126 points); a rack of that size is 2.8 x slot + 70 tall.
  const slotFloor = tight ? Math.max(22, Math.min(28, Math.floor((height - 17 - 126 - 70) / 2.8))) : 24;
  const rackMaxSlot = Math.max(slotFloor, Math.min(64, Math.floor((height * (wide ? 0.45 : 0.3) - 76) / 2.8) + 2));
  const feltTile = wide ? Math.max(tight ? 18 : 22, Math.min(44, Math.floor(height / 18))) : 24;

  // Sideways, the rack is only as wide as a hand needs; what is left at its two ends holds
  // your panel with the status, and the joker with the buttons.
  const pad = tight ? 6 : short ? 8 : 16;
  const contentWidth = Math.min(width, 1280) - pad * 2;
  const sideMin = tight ? 118 : short ? 140 : 190;
  const sideways = sidewaysRack(contentWidth - 2 * (sideMin + 8), rackMaxSlot, RACK_PAD);

  const panel = (seat: number, compact = false) => (
    <PlayerPanel
      name={PLAYER_NAMES[seat]!}
      tileCount={handOf(game.players[seat]!).length}
      points={game.players[seat]!.total}
      isTurn={playing && round.current === seat}
      you={seat === YOU}
      secondsLeft={seat === YOU ? p.secondsLeft : undefined}
      compact={compact}
      small={wide && !short}
      tiny={wide && short}
    />
  );

  // The felt's own size decides how big the discards are and how much of the pile is drawn.
  // Until it has been measured, go by the screen. Its rim and padding come off each way.
  const feltFrame = tight ? 16 : 32;
  const feltW = (feltSize?.width ?? (wide ? contentWidth : width - 20)) - feltFrame;
  const feltH = (feltSize?.height ?? (wide ? height * 0.45 : 330)) - feltFrame;
  const sizes = feltLayout(feltW, feltH, feltTile, {
    wide,
    dense: tight,
    panelWidth: short ? 128 : 154,
    panelHeight: short ? 34 : 50,
    maxDiscard: Math.min(34, Math.round(feltTile * 1.4)),
  });

  const pile = (
    <MiddlePile
      count={round.middle.length}
      indicator={round.indicator}
      canDraw={p.yourTurn && round.phase === 'draw'}
      onDraw={drawMiddle}
      onDropAt={dropOnRack.middle}
      onDragChange={setLifted}
      tileWidth={feltTile}
      maxStacks={sizes.stacks}
      dense={tight}
    />
  );

  // A discard is left for the next player, so it lies in front of them, not of whoever discarded it.
  const seats = game.players.length;
  const leftFor = (seat: number, badge: 'full' | 'compact' | 'none' = 'full') => (
    <DiscardRow
      key={seat}
      name={PLAYER_NAMES[seat]!}
      you={seat === YOU}
      discards={round.discards.filter((d) => (d.by + 1) % seats === seat).map((d) => d.tile)}
      last={round.lastDiscard && (round.lastDiscard.by + 1) % seats === seat ? round.lastDiscard.tile : null}
      takeable={seat === YOU && p.lastDiscardTakeable}
      joker={round.joker}
      tileWidth={sizes.discardTile}
      badge={badge}
      onTake={takeDiscard}
      onDropAt={dropOnRack.discard}
      onDragChange={setLifted}
    />
  );

  const onFeltLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setFeltSize((old) => (old && old.width === w && old.height === h ? old : { width: w, height: h }));
  };

  const felt = wide ? (
    // A table seen from above: left, across and right sit at its edges with their tiles in
    // front of them, the pile is in the centre, and your tiles lie nearest your rack.
    <View
      style={[styles.felt, styles.feltCross, tight && styles.feltTight, lifted && styles.lifted]}
      testID="felt"
      onLayout={onFeltLayout}
    >
      <View style={styles.feltSide}>
        {panel(3)}
        {leftFor(3, 'none')}
      </View>
      <View style={styles.feltCentre}>
        <View style={styles.feltAcross}>
          {panel(2)}
          {leftFor(2, 'none')}
        </View>
        {sizes.arrangement === 'crossFlat' ? (
          // On a low table your tiles lie beside the pile: both things you can draw from, together.
          <View style={styles.feltAcross}>
            {pile}
            {leftFor(YOU)}
          </View>
        ) : (
          <>
            {pile}
            {leftFor(YOU)}
          </>
        )}
      </View>
      <View style={styles.feltSide}>
        {panel(1)}
        {leftFor(1, 'none')}
      </View>
    </View>
  ) : (
    <View style={[styles.felt, styles.feltNarrow, lifted && styles.lifted]} testID="felt" onLayout={onFeltLayout}>
      <View style={sizes.arrangement === 'grid' ? styles.feltLine : styles.feltStack}>
        {leftFor(2, sizes.arrangement === 'grid' ? 'compact' : 'full')}
        {leftFor(1, sizes.arrangement === 'grid' ? 'compact' : 'full')}
      </View>
      {pile}
      <View style={sizes.arrangement === 'grid' ? styles.feltLine : styles.feltStack}>
        {leftFor(3, sizes.arrangement === 'grid' ? 'compact' : 'full')}
        {leftFor(YOU, sizes.arrangement === 'grid' ? 'compact' : 'full')}
      </View>
    </View>
  );

  const statusPanel = (
    <View style={[styles.statusPanel, wide && styles.statusPanelSide, tight && styles.statusPanelTight]}>
      {p.log && (
        <Text style={[styles.log, tight && styles.logTight]} numberOfLines={tight ? 3 : 2} testID="log">
          {p.log}
        </Text>
      )}
      <Text
        style={[styles.status, tight && styles.statusTight, p.canClose && styles.statusClose]}
        testID="status"
        accessibilityLiveRegion="polite"
      >
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
        style={[styles.button, wide && styles.buttonSide, !p.canDiscard && styles.dim]}
      >
        <Text style={styles.buttonText}>Discard</Text>
      </Pressable>
      {/* Close only appears once the rack shows a closing hand: every tile connected, one to spare. */}
      {p.canClose && (
        <Pressable
          accessibilityRole="button"
          onPress={() => p.close()}
          style={[styles.button, wide && styles.buttonSide, styles.closeButton]}
        >
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      )}
      <View
        style={[styles.jokerBox, tight && styles.jokerBoxTight]}
        accessibilityLabel={`Joker: ${round.joker.color} ${round.joker.number}`}
      >
        <Text style={styles.jokerLabel}>JOKER</Text>
        <Tile
          id={tileId(round.joker.color, round.joker.number)}
          width={tight ? 18 : wide ? 30 : 24}
          testID="joker-tile"
        />
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
      maxSlot={wide ? sideways.slot : rackMaxSlot}
      maxCols={wide ? SIDEWAYS_RACK_COLS : undefined}
      onResize={p.resize}
    />
  );

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {wide ? (
        <View style={[styles.wideContent, { padding: pad }, short && styles.wideShort]}>
          {felt}
          <View style={styles.rackRow}>
            {/* The side panels are laid over their columns, so the rack alone sets the row's height. */}
            <View style={styles.rackSide}>
              <View style={styles.rackSideFill}>
                {panel(YOU)}
                {statusPanel}
              </View>
            </View>
            <View style={{ width: sideways.width }}>{rack}</View>
            <View style={styles.rackSide}>
              <View style={[styles.rackSideFill, styles.rackSideEnd]}>{controls}</View>
            </View>
          </View>
          {/* In the empty corner of the felt, for browsers that can go full screen. */}
          <View style={[styles.corner, { top: pad + (tight ? 8 : 16), right: pad + (tight ? 8 : 16) }]}>
            <FullscreenButton compact />
          </View>
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
  wideContent: { flex: 1, gap: 12, width: '100%', maxWidth: 1280, alignSelf: 'center' },
  wideShort: { gap: 6 },
  corner: { position: 'absolute' },
  // Your rack with a panel at each end: you and the status on the left, joker and buttons on the right.
  rackRow: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 8 },
  rackSide: { flex: 1, minWidth: 0 },
  rackSideFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, gap: 6, overflow: 'hidden' },
  rackSideEnd: { justifyContent: 'center' },
  narrowContent: { flex: 1, padding: 10, gap: 10 },
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
  feltNarrow: { flex: 1, minHeight: 200, justifyContent: 'space-between' },
  // Sideways: left player, a centre column (the player across, the pile, your tiles), right player.
  feltCross: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  feltSide: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  feltCentre: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'space-between' },
  feltAcross: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Upright: two rows on a line, or one under the other, above and below the pile.
  feltLine: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  feltStack: { alignItems: 'center', gap: 6 },
  feltTight: { borderWidth: 4, padding: 4, borderRadius: 14 },
  lifted: { zIndex: 20, elevation: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
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
  // Beside the rack it fills the space under your panel.
  statusPanelSide: { flex: 1, minHeight: 0, paddingHorizontal: 8, overflow: 'hidden' },
  statusPanelTight: { paddingVertical: 3, paddingHorizontal: 5 },
  statusTight: { fontSize: 11 },
  logTight: { fontSize: 10 },
  log: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  status: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  statusClose: { color: colors.accent },
  message: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  button: { justifyContent: 'center', backgroundColor: colors.accent, paddingHorizontal: 14, borderRadius: 10 },
  buttonSide: { alignItems: 'center', paddingVertical: 8 },
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
  jokerBoxTight: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  jokerLabel: { color: colors.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
