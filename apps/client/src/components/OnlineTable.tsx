import { StyleSheet, Text, View } from 'react-native';
import type { PlayerView } from '@gur/engine';
import type { LobbyState } from '@gur/server/protocol';
import { GameTable } from './GameTable';
import { ResultsOverlay } from './ResultsOverlay';
import { TableChat } from './TableChat';
import type { Connection, OnlineStatus, TableLine } from '@/online/connection';
import { useTableChat } from '@/online/tableChat';
import { useCountdown, useOnlineTable } from '@/online/useOnlineTable';
import { colors } from '@/theme';

type Props = {
  lobby: LobbyState & { game: PlayerView };
  connection: Connection;
  clockOffset: number;
  status: OnlineStatus;
  /** Leave the lobby and go back to the menu. */
  onLeave: () => void;
  /** The chat at the table. */
  chat?: readonly TableLine[];
  /** At a public table, after its round: find a new table. */
  onPlayAgain?: () => void;
};

/** A game with friends: the same table as against the bots, run by the server. */
export function OnlineTable({ lobby, connection, clockOffset, status, onLeave, chat = [], onPlayAgain }: Props) {
  const table = useOnlineTable(lobby, connection, clockOffset);
  const { view } = table;
  const host = lobby.members[lobby.you]!.host;
  const hostName = lobby.members.find((m) => m.host)?.name ?? 'the host';
  const { speech } = useTableChat(lobby, chat);
  const nextIn = useCountdown(view.status === 'roundOver' ? lobby.nextRoundAt : null, clockOffset);

  const over = view.status !== 'playing';
  // A public table plays one round: then anyone can play again at a new table, or leave.
  const open = lobby.kind === 'public';
  const note = open
    ? null
    : view.status === 'roundOver'
      ? nextIn === null
        ? 'The next round starts soon'
        : `The next round starts in ${nextIn} second${nextIn === 1 ? '' : 's'}`
      : host
        ? null
        : `Waiting for ${hostName} to go back to the lobby`;
  const primary = open
    ? onPlayAgain
      ? { label: 'Play again', onPress: onPlayAgain }
      : null
    : !host
      ? null
      : view.status === 'roundOver'
        ? { label: 'Next round now', onPress: () => void connection.next() }
        : { label: 'Back to the lobby', onPress: () => void connection.next() };

  return (
    <View style={styles.fill}>
      <GameTable
        table={table}
        onLeave={onLeave}
        speech={speech}
        chatButton={
          <TableChat
            lobby={lobby}
            chat={chat}
            onSay={(text) => connection.say(text)}
            onReport={(chatId, why, note, alsoBlock) => connection.report(chatId, why, note, alsoBlock)}
          />
        }
        leaveNote="The game goes on without you: your turns are played for you. You cannot come back to this game."
        overlay={
          over && (
            <ResultsOverlay
              view={view}
              names={table.names}
              primary={primary}
              note={note}
              menuLabel="Leave"
              onMenu={onLeave}
            />
          )
        }
      />
      {status !== 'online' && (
        <View style={styles.banner} testID="connection-lost" accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>Connection lost. Getting you back to the table…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  bannerText: { color: '#2A2A2A', fontSize: 13, fontWeight: '700' },
});
