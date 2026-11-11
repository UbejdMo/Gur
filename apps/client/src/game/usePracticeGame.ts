import { useEffect, useMemo, useReducer, useState } from 'react';
import { checkClosingHand, createGame, handOf, turnSeconds } from '@gur/engine';
import type { Game, TileId } from '@gur/engine';
import { YOU, initialState, practiceReducer } from './practiceReducer';

export { YOU };
export const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];

export type PracticeOptions = {
  aceHigh: boolean;
  /** Pause before each bot move, so people can follow the play. */
  botDelayMs?: number;
  /** Turn timer for your turns (15 seconds). */
  timer?: boolean;
  /** Starts a round; tests pass a fixed deal. */
  newGame?: (aceHigh: boolean) => Game;
};

const defaultNewGame = (aceHigh: boolean) => createGame({ aceHigh, rounds: 1 }, PLAYER_NAMES, Math.random);

export function usePracticeGame({
  aceHigh,
  botDelayMs = 700,
  timer = true,
  newGame = defaultNewGame,
}: PracticeOptions) {
  const [state, dispatch] = useReducer(practiceReducer, undefined, () => initialState(newGame(aceHigh)));
  const [tick, setTick] = useState<{ turn: string; left: number } | null>(null);
  const { game, layout, selected, message } = state;
  const { round, status } = game;
  const yourTurn = status === 'playing' && round.current === YOU;
  const hand = handOf(game.players[YOU]!);

  // Bots play their turns one after another.
  useEffect(() => {
    if (game.status !== 'playing' || game.round.current === YOU) return;
    const t = setTimeout(() => dispatch({ type: 'bot' }), botDelayMs);
    return () => clearTimeout(t);
  }, [game, botDelayMs]);

  // Your turn timer: when it runs out, the engine draws and discards for you.
  // A turn is identified by round and discard count, so drawing doesn't restart it.
  const turn = `${round.number}:${round.discards.length + game.results.length}`;
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

  const canCloseWith = useMemo(() => {
    const ok = new Set<TileId>();
    if (!yourTurn || round.phase !== 'discard' || hand.length !== 15) return ok;
    for (const t of hand) {
      const rest = hand.filter((x) => x !== t);
      if (checkClosingHand(rest, round.joker, game.settings.aceHigh)) ok.add(t);
    }
    return ok;
  }, [yourTurn, round.phase, round.joker, hand, game.settings.aceHigh]);

  const canDiscardNow = yourTurn && round.phase === 'discard';

  // Stable functions: dispatch never changes, so the rack's drag handlers aren't rebuilt each render.
  const actions = useMemo(
    () => ({
      select: (tile: TileId) => dispatch({ type: 'select', tile }),
      moveSelected: (slot: number) => dispatch({ type: 'moveSelected', slot }),
      drop: (tile: TileId, slot: number) => dispatch({ type: 'drop', tile, slot }),
      dropUp: (tile: TileId) => dispatch({ type: 'dropUp', tile }),
      drawMiddle: () => dispatch({ type: 'drawMiddle' }),
      takeDiscard: () => dispatch({ type: 'takeDiscard' }),
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
    secondsLeft,
    yourTurn,
    canDiscardNow,
    canDiscard: canDiscardNow && selected !== null,
    canClose: selected !== null && canCloseWith.has(selected),
    canCloseWith,
    lastDiscardTakeable: yourTurn && round.phase === 'draw' && round.lastDiscard !== null,

    ...actions,
    playAgain: () => dispatch({ type: 'newGame', game: newGame(aceHigh) }),
  };
}

export type PracticeGame = ReturnType<typeof usePracticeGame>;
