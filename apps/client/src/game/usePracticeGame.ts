import { useEffect, useMemo, useReducer, useState } from 'react';
import { createGame, handOf, turnSeconds } from '@gur/engine';
import type { Game, TileId } from '@gur/engine';
import { YOU, closingTiles, initialState, practiceReducer } from './practiceReducer';
import type { Place } from './practiceReducer';
import type { Side } from './rackLayout';

export { YOU };
export const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];

export type PracticeOptions = {
  aceHigh: boolean;
  /**
   * How long a bot takes over its turn, in milliseconds: one number, or [shortest, longest] for a
   * random time in between. Bots are slow on purpose, so you have time to arrange your rack.
   */
  botDelayMs?: number | readonly [number, number];
  /** Turn timer for your turns (15 seconds). */
  timer?: boolean;
  /** Starts a round; tests pass a fixed deal. */
  newGame?: (aceHigh: boolean) => Game;
};

/** Each bot takes 4 to 10 seconds over its turn. */
export const SLOW_BOTS = [4000, 10000] as const;
export const FAST_BOTS = 700;

const defaultNewGame = (aceHigh: boolean) => createGame({ aceHigh, rounds: 1 }, PLAYER_NAMES, Math.random);

export function usePracticeGame({
  aceHigh,
  botDelayMs = SLOW_BOTS,
  timer = true,
  newGame = defaultNewGame,
}: PracticeOptions) {
  const [state, dispatch] = useReducer(practiceReducer, undefined, () => initialState(newGame(aceHigh)));
  const [tick, setTick] = useState<{ turn: string; left: number } | null>(null);
  const { game, layout, selected, message, log } = state;
  const { round, status } = game;
  const yourTurn = status === 'playing' && round.current === YOU;
  const hand = handOf(game.players[YOU]!);

  // A turn is identified by round and turn number, so drawing or moving tiles doesn't restart a clock.
  const turn = `${round.number}:${round.turn}:${game.results.length}`;

  // Bots play their turns one after another. You can keep arranging your rack while they think.
  const botPlaying = status === 'playing' && round.current !== YOU;
  const [botMin, botMax] = typeof botDelayMs === 'number' ? [botDelayMs, botDelayMs] : botDelayMs;
  useEffect(() => {
    if (!botPlaying) return;
    const t = setTimeout(() => dispatch({ type: 'bot' }), botMin + Math.random() * (botMax - botMin));
    return () => clearTimeout(t);
  }, [botPlaying, turn, botMin, botMax]);

  // Your turn timer: when it runs out, the engine draws and discards for you.
  const turnTotal = turnSeconds(game);
  const timing = timer && yourTurn;
  useEffect(() => {
    if (!timing) return;
    const deadline = Date.now() + turnTotal * 1000;
    const update = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTick({ turn, left });
      if (left === 0) {
        clearInterval(id);
        dispatch({ type: 'timeout' });
      }
    };
    const id = setInterval(update, 250);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [timing, turn, turnTotal]);
  const secondsLeft = timing ? (tick?.turn === turn ? tick.left : turnTotal) : null;

  // Tiles you could close with right now. Close works whenever this isn't empty.
  const canCloseWith = useMemo(() => new Set(closingTiles(game)), [game]);

  const canDiscardNow = yourTurn && round.phase === 'discard';

  // Stable functions: dispatch never changes, so the rack's drag handlers aren't rebuilt each render.
  const actions = useMemo(
    () => ({
      select: (tile: TileId) => dispatch({ type: 'select', tile }),
      moveSelected: (slot: number) => dispatch({ type: 'moveSelected', slot }),
      drop: (tile: TileId, slot: number, side?: Side) => dispatch({ type: 'drop', tile, slot, side }),
      resize: (cols: number) => dispatch({ type: 'resize', cols }),
      dropUp: (tile: TileId) => dispatch({ type: 'dropUp', tile }),
      drawMiddle: (at?: Place) => dispatch({ type: 'drawMiddle', at }),
      takeDiscard: (at?: Place) => dispatch({ type: 'takeDiscard', at }),
      discard: (tile?: TileId) => dispatch({ type: 'discard', tile }),
      close: (tile?: TileId) => dispatch({ type: 'close', tile }),
    }),
    [],
  );

  return {
    game,
    hand,
    layout,
    selected,
    message,
    log,
    secondsLeft,
    yourTurn,
    canDiscardNow,
    canDiscard: canDiscardNow && selected !== null,
    canClose: canCloseWith.size > 0,
    canCloseWith,
    lastDiscardTakeable: yourTurn && round.phase === 'draw' && round.lastDiscard !== null,

    ...actions,
    playAgain: () => dispatch({ type: 'newGame', game: newGame(aceHigh) }),
  };
}

export type PracticeGame = ReturnType<typeof usePracticeGame>;
