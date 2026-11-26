import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { PlayerView } from '@gur/engine';
import type { LobbyState } from '@gur/server/protocol';
import { LobbyRoom } from '@/components/LobbyRoom';
import { OnlineTable } from '@/components/OnlineTable';
import { online } from '@/online/connection';
import { useOnline } from '@/online/useOnline';
import { colors } from '@/theme';
import { useT } from '@/i18n';

/**
 * Your lobby: the waiting room until the host starts (or a public table starts by itself), then
 * the table. Opened without a lobby (a reloaded page, say) it goes back into the one you were
 * in, if it still exists; otherwise to the first screen.
 */
export default function LobbyScreen() {
  const t = useT();
  const { lobby, status, clockOffset, chat } = useOnline();
  const missing = lobby === null;

  useEffect(() => {
    if (!missing) return;
    let gone = false;
    void online.resume().then((back) => {
      if (!back && !gone) router.replace('/');
    });
    return () => {
      gone = true;
    };
  }, [missing]);

  const leave = () => {
    void online.leave();
    router.replace('/');
  };

  // A public table: after its round, a new table with the same 12-13-1 choice.
  const playAgain = async () => {
    if (!lobby) return;
    const me = lobby.members[lobby.you]!;
    // A guest plays under the name they typed (their seat may say "Ana 2"); the server knows a signed-in player.
    const answer = await online.find(online.savedName() || me.name, lobby.settings.aceHigh);
    if (!answer.ok) leave();
  };

  if (!lobby) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t.lobby.gettingBack}</Text>
      </View>
    );
  }
  if (lobby.game) {
    return (
      <OnlineTable
        lobby={lobby as LobbyState & { game: PlayerView }}
        connection={online}
        clockOffset={clockOffset}
        status={status}
        onLeave={leave}
        chat={chat}
        onPlayAgain={lobby.kind === 'public' ? () => void playAgain() : undefined}
      />
    );
  }
  return (
    <LobbyRoom
      lobby={lobby}
      onSettings={(c) => online.settings(c)}
      onStart={() => online.start()}
      onLeave={leave}
      onInvite={(userId) => online.invite(userId)}
      chat={chat}
      onSay={(text) => online.say(text)}
      onReport={(chatId, why, note, alsoBlock) => online.report(chatId, why, note, alsoBlock)}
      clockOffset={clockOffset}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.table, padding: 24 },
  text: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
