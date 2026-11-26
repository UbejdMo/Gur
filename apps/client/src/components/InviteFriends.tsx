import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Ack, LobbyState } from '@gur/server/protocol';
import { useAccount, useFriends } from '@/account';
import { Avatar } from './Avatar';
import { colors } from '@/theme';
import { useT } from '@/i18n';

type Props = {
  lobby: LobbyState;
  onInvite: (userId: string) => Promise<Ack<{ seconds: number }>>;
};

const SEATS = 4;
const clock = () => Date.now();

/**
 * For the lobby leader: their friends, each with an Invite button. An invite lasts a few
 * seconds (the server says how long); when it runs out without an answer it can be sent again.
 */
export function InviteFriends({ lobby, onInvite }: Props) {
  const t = useT();
  const { profile } = useAccount();
  const { status, people } = useFriends();
  /** Invites still running: friend's account id -> when it runs out (this device's clock). */
  const [pending, setPending] = useState<Record<string, number>>({});
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(clock);
  const [error, setError] = useState<string | null>(null);

  const running = Object.values(pending).some((until) => until > now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(clock()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const inLobby = new Set(lobby.members.map((m) => m.publicId).filter(Boolean));
  const friends = people.filter((p) => p.state === 'friend' && !inLobby.has(p.publicId));
  const full = lobby.members.length >= SEATS;

  const invite = async (id: string) => {
    setError(null);
    const answer = await onInvite(id);
    if (!answer.ok) {
      setError(answer.error);
      return;
    }
    const time = clock();
    setNow(time);
    setPending((p) => ({ ...p, [id]: time + answer.seconds * 1000 }));
    setSent((s) => new Set(s).add(id));
  };

  return (
    <View style={styles.card} testID="invite-friends">
      <Text style={styles.label}>{t.invite.title}</Text>
      {!profile ? (
        <Text style={styles.hint}>{t.invite.signIn}</Text>
      ) : full ? (
        <Text style={styles.hint}>{t.invite.full}</Text>
      ) : friends.length === 0 ? (
        <Text style={styles.hint}>
          {status === 'ready' || status === 'failed'
            ? people.some((p) => p.state === 'friend')
              ? t.invite.allHere
              : t.invite.none
            : t.common.oneMoment}
        </Text>
      ) : (
        friends.map((friend) => {
          const left = Math.ceil(((pending[friend.id] ?? 0) - now) / 1000);
          const waiting = left > 0;
          return (
            <View key={friend.id} style={styles.row} testID={`invite-${friend.username}`}>
              <Avatar name={friend.username} url={friend.avatarUrl} size={36} />
              <Text style={styles.name} numberOfLines={1}>
                {friend.username}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  waiting ? t.invite.invited(friend.username, left) : t.invite.inviteNamed(friend.username)
                }
                accessibilityState={{ disabled: waiting }}
                aria-disabled={waiting}
                onPress={() => !waiting && void invite(friend.id)}
                style={[styles.button, waiting && styles.buttonWaiting]}
              >
                <Text style={[styles.buttonText, waiting && styles.buttonWaitingText]}>
                  {waiting ? t.invite.invitedShort(left) : sent.has(friend.id) ? t.invite.again : t.invite.invite}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}
      {error && (
        <Text style={styles.error} testID="invite-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.tableDark, borderRadius: 14, padding: 12, gap: 10 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  button: { backgroundColor: colors.accent, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16, minWidth: 96 },
  buttonWaiting: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.textMuted },
  buttonText: { color: '#2A2A2A', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  buttonWaitingText: { color: colors.textMuted },
  error: { color: colors.danger, fontSize: 13 },
});
