import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { handOf, isRealJoker } from '@gur/engine';
import { Rack } from './Rack';
import { ResultsOverlay } from './ResultsOverlay';
import { Seat } from './Seat';
import { Tile } from './Tile';
import { PLAYER_NAMES, usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';
import { colors } from '@/theme';

type Props = PracticeOptions & { onMenu: () => void };

/** The practice table: you at the bottom, three bots around you, play running counter-clockwise. */
export function Table({ onMenu, ...options }: Props) {
  const p = usePracticeGame(options);
  const { game } = p;
  const { round } = game;
  const playing = game.status === 'playing';

  const status = !playing
    ? 'Round over'
    : !p.yourTurn
      ? `${PLAYER_NAMES[round.current]} is playing…`
      : round.phase === 'draw'
        ? 'Your turn: draw from the middle or take the last discard'
        : p.selected === null
          ? 'Pick the tile to discard, or close'
          : 'Discard it, close with it, or tap another tile to move it there';

  // Counter-clockwise from you: the next player sits to your right, then opposite, then left.
  const seat = (i: number) => (
    <Seat name={PLAYER_NAMES[i]!} tileCount={handOf(game.players[i]!).length} isTurn={playing && round.current === i} />
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>{seat(2)}</View>

        <View style={styles.middleRow}>
          {seat(3)}
          <View style={styles.center}>
            <View style={styles.centerItem}>
              <Text style={styles.label}>Indicator</Text>
              <Tile id={round.indicator} size="small" testID="indicator" />
              <Text style={styles.joker} testID="joker">
                Joker: {round.joker.color} {round.joker.number}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Draw from the middle, ${round.middle.length} tiles left`}
              accessibilityState={{ disabled: !(p.yourTurn && round.phase === 'draw') }}
              testID="draw-middle"
              disabled={!(p.yourTurn && round.phase === 'draw')}
              onPress={p.drawMiddle}
              style={[styles.pile, p.yourTurn && round.phase === 'draw' && styles.active]}
            >
              <Text style={styles.pileCount} testID="middle-count">
                {round.middle.length}
              </Text>
              <Text style={styles.pileLabel}>Middle</Text>
            </Pressable>
            <View style={styles.centerItem}>
              <Text style={styles.label}>Discard</Text>
              {round.lastDiscard ? (
                <View style={p.lastDiscardTakeable && styles.activeTile}>
                  <Tile
                    id={round.lastDiscard.tile}
                    size="small"
                    testID="last-discard"
                    wild={isRealJoker(round.lastDiscard.tile, round.joker)}
                    onPress={p.lastDiscardTakeable ? p.takeDiscard : undefined}
                  />
                </View>
              ) : (
                <View style={styles.emptyDiscard} />
              )}
              <Text style={styles.joker}>{round.lastDiscard ? PLAYER_NAMES[round.lastDiscard.by] : ' '}</Text>
            </View>
          </View>
          {seat(1)}
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.status} testID="status" accessibilityLiveRegion="polite">
            {status}
          </Text>
          {p.secondsLeft !== null && (
            <Text style={[styles.timer, p.secondsLeft <= 3 && styles.timerLow]} testID="timer">
              {p.secondsLeft}s
            </Text>
          )}
        </View>
        {p.message && (
          <Text style={styles.message} testID="message">
            {p.message}
          </Text>
        )}

        <Rack
          groups={p.groups}
          joker={round.joker}
          aceHigh={game.settings.aceHigh}
          selected={p.selected}
          onSelect={p.select}
          onMove={p.moveSelected}
        />

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !p.canDiscard }}
            disabled={!p.canDiscard}
            onPress={p.discardSelected}
            style={[styles.button, !p.canDiscard && styles.disabled]}
          >
            <Text style={styles.buttonText}>Discard</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !p.canClose }}
            disabled={!p.canClose}
            onPress={p.closeWithSelected}
            style={[styles.button, styles.closeButton, !p.canClose && styles.disabled]}
          >
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Green outlines show melds. Only tiles in a melded group are safe when someone closes.
        </Text>
      </ScrollView>

      {game.status !== 'playing' && <ResultsOverlay game={game} onPlayAgain={p.playAgain} onMenu={onMenu} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', padding: 12, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  top: { alignItems: 'center' },
  middleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 6 },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.felt,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  centerItem: { alignItems: 'center', gap: 4 },
  label: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  joker: { fontSize: 11, color: colors.text, textTransform: 'capitalize' },
  pile: {
    width: 58,
    height: 74,
    borderRadius: 8,
    backgroundColor: colors.tableDark,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: colors.accent, borderWidth: 3 },
  activeTile: { borderRadius: 8, borderWidth: 3, borderColor: colors.accent },
  pileCount: { color: colors.text, fontSize: 22, fontWeight: '800' },
  pileLabel: { color: colors.textMuted, fontSize: 11 },
  emptyDiscard: {
    width: 32,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  status: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  timer: { color: colors.accent, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerLow: { color: colors.danger },
  message: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24 },
  closeButton: { backgroundColor: colors.meld },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#2A2A2A' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', maxWidth: 360 },
});
