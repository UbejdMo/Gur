import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RuleError,
  arrange,
  botTurn,
  checkClosingHand,
  close,
  createGame,
  discard,
  draw,
  handOf,
  timeoutMove,
  turnSeconds,
} from '@gur/engine';
import type { Game, TileId } from '@gur/engine';
import { moveTile } from './rack';
import type { MoveTarget } from './rack';

export const YOU = 0;
export const PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];

export type PracticeOptions = {
  aceHigh: boolean;
  /** Pause before each bot move, so people can follow the play. */
  botDelayMs?: number;
  /** Turn timer for your turns (10 seconds, 15 for the first turn). */
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
  const [game, setGame] = useState<Game>(() => newGame(aceHigh));
  const [selected, setSelected] = useState<TileId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState<{ turn: string; left: number } | null>(null);

  const { round, status } = game;
  const yourTurn = status === 'playing' && round.current === YOU;
  const hand = handOf(game.players[YOU]!);

  /** Runs an engine action for you; a rule error becomes a message instead of a crash. */
  const act = useCallback(
    (fn: (g: Game) => Game) => {
      try {
        setGame(fn(game));
        setMessage(null);
      } catch (e) {
        if (e instanceof RuleError) setMessage(e.message);
        else throw e;
      }
    },
    [game],
  );

  // Bots play their turns one after another.
  useEffect(() => {
    if (game.status !== 'playing' || game.round.current === YOU) return;
    const t = setTimeout(
      () => setGame((g) => (g.status === 'playing' && g.round.current !== YOU ? botTurn(g) : g)),
      botDelayMs,
    );
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
        setSelected(null);
        setGame((g) => (g.status === 'playing' && g.round.current === YOU ? timeoutMove(g) : g));
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

  const canClose = useMemo(() => {
    if (!yourTurn || round.phase !== 'discard' || selected === null || hand.length !== 15) return false;
    return (
      checkClosingHand(
        hand.filter((t) => t !== selected),
        round.joker,
        game.settings.aceHigh,
      ) !== null
    );
  }, [yourTurn, round.phase, round.joker, selected, hand, game.settings.aceHigh]);

  const lastDiscardTakeable = yourTurn && round.phase === 'draw' && round.lastDiscard !== null;

  return {
    game,
    hand,
    groups: game.players[YOU]!.groups,
    selected,
    message,
    secondsLeft,
    yourTurn,
    canDiscard: yourTurn && round.phase === 'discard' && selected !== null,
    canClose,
    lastDiscardTakeable,

    select: (tile: TileId) => setSelected((s) => (s === tile ? null : tile)),
    moveSelected: (target: MoveTarget) => {
      if (selected === null) return;
      act((g) => arrange(g, YOU, moveTile(g.players[YOU]!.groups, selected, target)));
      setSelected(null);
    },
    drawMiddle: () => act((g) => draw(g, YOU, 'middle')),
    takeDiscard: () => act((g) => draw(g, YOU, 'discard')),
    discardSelected: () => {
      if (selected === null) return;
      act((g) => discard(g, YOU, selected));
      setSelected(null);
    },
    closeWithSelected: () => {
      if (selected === null) return;
      act((g) => close(g, YOU, selected));
      setSelected(null);
    },
    playAgain: () => {
      setSelected(null);
      setMessage(null);
      setGame(newGame(aceHigh));
    },
  };
}

export type PracticeGame = ReturnType<typeof usePracticeGame>;
