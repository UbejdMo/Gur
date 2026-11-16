import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { PlayerView, TileId } from '@gur/engine';
import type { GameAction, LobbyState } from '@gur/server/protocol';
import { layoutGroups, sameGroups } from '@/game/rackLayout';
import type { Side } from '@/game/rackLayout';
import { pickClosingTile, tableFlags } from '@/game/tableModel';
import type { Place, TableModel } from '@/game/tableModel';
import type { Connection } from './connection';
import { initialOnlineTable, onlineTableReducer } from './onlineTable';

/** Seconds until a moment on the server's clock, counted down on this device. Null when there is none. */
export function useCountdown(endsAt: number | null, clockOffset: number): number | null {
  const [tick, setTick] = useState<{ endsAt: number; left: number } | null>(null);
  useEffect(() => {
    if (endsAt === null) return;
    const update = () =>
      setTick({ endsAt, left: Math.max(0, Math.ceil((endsAt - (Date.now() + clockOffset)) / 1000)) });
    const id = setInterval(update, 250);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [endsAt, clockOffset]);
  // Unknown for the instant before the first tick.
  return tick?.endsAt === endsAt ? tick.left : null;
}

/**
 * Drives the table from a game on the server. Your rack is arranged here, on your device,
 * and the server is told how it lies (it needs to know, to judge a close). Every move is an
 * intention sent to the server; if the server refuses, its reason is shown.
 */
export function useOnlineTable(
  lobby: LobbyState & { game: PlayerView },
  connection: Connection,
  clockOffset: number,
): TableModel {
  const names = useMemo(() => lobby.members.map((m) => m.name), [lobby.members]);
  const [state, dispatch] = useReducer(onlineTableReducer, undefined, () => initialOnlineTable(lobby.game, names));
  // Follow the server: a new view is taken in before this render goes on.
  if (state.view !== lobby.game) dispatch({ type: 'server', view: lobby.game, names });

  const { view, layout, selected } = state;
  const groups = useMemo(() => layoutGroups(layout), [layout]);
  const flags = useMemo(() => tableFlags(view, groups, selected), [view, groups, selected]);
  const secondsLeft = useCountdown(view.status === 'playing' ? lobby.turnEndsAt : null, clockOffset);

  // Tell the server how the rack lies whenever it differs from what the server has.
  const serverGroups = view.players[view.seat]!.groups ?? [];
  const inSync = sameGroups(groups, serverGroups);
  const key = groups.map((g) => g.join(',')).join('|');
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (view.status !== 'playing' || inSync || sent.current === key) return;
    sent.current = key;
    void connection.act({ type: 'arrange', groups });
  }, [connection, view.status, inSync, key, groups]);

  // What the action functions below need. They stay the same functions for the whole game (the
  // rack's drag handling depends on that), so they read the latest values from here.
  const latest = useRef({ groups, selected, flags, view });
  useLayoutEffect(() => {
    latest.current = { groups, selected, flags, view };
  });

  const actions = useMemo(() => {
    /** Sends a move; the server's refusal, if any, becomes the message on the table. */
    const send = async (action: GameAction) => {
      const answer = await connection.act(action);
      dispatch({ type: 'message', text: answer.ok ? null : answer.error });
    };
    /** A close is judged on the rack as it lies, so the server is told that first. */
    const closeWith = async (tile: TileId) => {
      await connection.act({ type: 'arrange', groups: latest.current.groups });
      await send({ type: 'close', tile });
    };
    const drawTo = (source: 'middle' | 'discard' | 'indicator', at?: Place) => {
      dispatch({ type: 'pending', at: at ?? null });
      void send({ type: 'draw', source });
    };
    return {
      select: (tile: TileId) => dispatch({ type: 'select', tile }),
      moveSelected: (slot: number) => dispatch({ type: 'moveSelected', slot }),
      drop: (tile: TileId, slot: number, side?: Side) => dispatch({ type: 'drop', tile, slot, side }),
      resize: (cols: number) => dispatch({ type: 'resize', cols }),
      dropUp: (tile: TileId) => {
        const { flags: now } = latest.current;
        if (!now.canDiscardNow) return;
        if (now.canCloseWith.has(tile)) void closeWith(tile);
        else void send({ type: 'discard', tile });
      },
      drawMiddle: (at?: Place) => drawTo('middle', at),
      takeDiscard: (at?: Place) => drawTo('discard', at),
      takeIndicator: (at?: Place) => drawTo('indicator', at),
      discard: (tile?: TileId) => {
        const chosen = tile ?? latest.current.selected;
        if (chosen !== null) void send({ type: 'discard', tile: chosen });
      },
      close: (tile?: TileId) => {
        const now = latest.current;
        const chosen =
          tile ??
          pickClosingTile(
            [...now.flags.canCloseWith],
            now.selected,
            now.groups,
            now.view.round.joker,
            now.view.settings.aceHigh,
          );
        if (chosen === null)
          dispatch({ type: 'message', text: 'Connect all your tiles into melds on the rack to close' });
        else void closeWith(chosen);
      },
    };
  }, [connection]);

  return {
    view,
    names: state.names,
    layout,
    selected,
    message: state.message,
    log: state.log,
    secondsLeft,
    yourTurn: flags.yourTurn,
    canDiscard: flags.canDiscard,
    tookIndicator: flags.tookIndicator,
    canClose: flags.canClose,
    lastDiscardTakeable: flags.lastDiscardTakeable,
    ...actions,
  };
}
