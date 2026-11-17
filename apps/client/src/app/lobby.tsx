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

/**
 * Your lobby: the waiting room until the host starts, then the table.
 * Opened without a lobby (a reloaded page, say) it goes back into the one you were in, if it
 * still exists; otherwise to "Play with friends".
 */
export default function LobbyScreen() {
  const { lobby, status, clockOffset } = useOnline();
  const missing = lobby === null;

  useEffect(() => {
    if (!missing) return;
    let gone = false;
    void online.resume().then((back) => {
      if (!back && !gone) router.replace('/friends');
    });
    return () => {
      gone = true;
    };
  }, [missing]);

  const leave = () => {
    void online.leave();
    router.replace('/');
  };

  if (!lobby) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Getting you back to your lobby…</Text>
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
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.table, padding: 24 },
  text: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
