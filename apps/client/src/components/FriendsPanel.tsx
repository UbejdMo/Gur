import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { friends, messages, useFriends, useMessages } from '@/account';
import type { Profile } from '@/account/account';
import type { Person } from '@/account/friends';
import { Avatar } from './Avatar';
import { colors } from '@/theme';

type Props = {
  profile: Profile;
  /** Opens the conversation with a friend. */
  onMessage?: (friend: Person) => void;
};

/**
 * Your friends, under the friends button at the top right: add one by username or ID, answer
 * the requests you got (or block whoever sent one), see who you are friends with and who you
 * asked, and the players you blocked.
 */
export function FriendsPanel({ profile, onMessage }: Props) {
  const { status: listStatus, people } = useFriends();
  const { blocked } = useMessages();
  // Opening the panel looks for news at once, rather than waiting for the next half-minute check.
  useEffect(() => {
    void friends.refresh();
    void messages.loadBlocked();
  }, []);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** The friend the player is being asked "really remove?" about. */
  const [removing, setRemoving] = useState<string | null>(null);
  /** The player who sent a request and is being asked "really block?" about. */
  const [blocking, setBlocking] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    const answer = await friends.add(who);
    setBusy(false);
    setMessage({ ok: answer.ok, text: answer.message });
    if (answer.ok) setWho('');
  };
  /** Runs a change on one person and shows what went wrong, if anything. */
  const act = async (change: Promise<string | null>) => {
    setRemoving(null);
    setBlocking(null);
    const problem = await change;
    setMessage(problem ? { ok: false, text: problem } : null);
  };

  const incoming = people.filter((p) => p.state === 'incoming');
  const mine = people.filter((p) => p.state === 'friend');
  const outgoing = people.filter((p) => p.state === 'outgoing');

  return (
    <View style={styles.box}>
      <View style={styles.card}>
        <Text style={styles.label}>Add a friend</Text>
        <TextInput
          accessibilityLabel="Username or ID"
          value={who}
          onChangeText={setWho}
          maxLength={16}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username or ID"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={() => void add()}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void add()}
          disabled={busy}
          style={({ pressed }) => [styles.primary, busy && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Send request</Text>
        </Pressable>
        <Text style={styles.hint}>
          Friends can add you as <Text style={styles.strong}>{profile.username}</Text> or by your ID{' '}
          <Text style={styles.strong} selectable>
            {profile.publicId}
          </Text>
          .
        </Text>
      </View>

      {message && (
        <Text style={message.ok ? styles.good : styles.error} testID="people-message">
          {message.text}
        </Text>
      )}

      {incoming.length > 0 && (
        <View style={styles.card} testID="requests">
          <Text style={styles.label}>Requests</Text>
          {incoming.map((p) =>
            blocking === p.id ? (
              <View key={p.id} style={styles.confirm}>
                <Text style={styles.confirmText}>
                  Block {p.username}? Their request goes, and neither of you can send the other a request or a message.
                  They are not told.
                </Text>
                <View style={styles.confirmRow}>
                  <Small
                    label={`Yes, block ${p.username}`}
                    danger
                    onPress={() =>
                      void act(
                        messages
                          .block(p.id)
                          .then((problem) => (problem ? problem : friends.refresh().then(() => null))),
                      )
                    }
                  >
                    Block
                  </Small>
                  <Small label={`Keep ${p.username}'s request`} onPress={() => setBlocking(null)}>
                    Cancel
                  </Small>
                </View>
              </View>
            ) : (
              <PersonRow key={p.id} person={p}>
                <Small label={`Accept ${p.username}`} on onPress={() => void act(friends.accept(p.id))}>
                  Accept
                </Small>
                <Small label={`Decline ${p.username}`} onPress={() => void act(friends.remove(p.id))}>
                  Decline
                </Small>
                <Small label={`Block ${p.username}`} quiet onPress={() => setBlocking(p.id)}>
                  Block
                </Small>
              </PersonRow>
            ),
          )}
        </View>
      )}

      <View style={styles.card} testID="friends-list">
        <Text style={styles.label}>Your friends</Text>
        {mine.length === 0 && (
          <Text style={styles.empty}>
            {listStatus === 'failed'
              ? 'Your friends could not be fetched. Check your connection.'
              : listStatus === 'ready'
                ? 'Nobody yet. Send a request above.'
                : 'One moment…'}
          </Text>
        )}
        {mine.map((p) =>
          removing === p.id ? (
            <PersonRow key={p.id} person={p}>
              <Small label={`Yes, remove ${p.username}`} danger onPress={() => void act(friends.remove(p.id))}>
                Remove
              </Small>
              <Small label={`Keep ${p.username}`} onPress={() => setRemoving(null)}>
                Keep
              </Small>
            </PersonRow>
          ) : (
            <PersonRow key={p.id} person={p}>
              {onMessage && (
                <Small label={`Message ${p.username}`} on onPress={() => onMessage(p)}>
                  Message
                </Small>
              )}
              <Small label={`Remove ${p.username}`} quiet onPress={() => setRemoving(p.id)}>
                Remove
              </Small>
            </PersonRow>
          ),
        )}
      </View>

      {outgoing.length > 0 && (
        <View style={styles.card} testID="sent">
          <Text style={styles.label}>Waiting for an answer</Text>
          {outgoing.map((p) => (
            <PersonRow key={p.id} person={p}>
              <Small
                label={`Take back the request to ${p.username}`}
                quiet
                onPress={() => void act(friends.remove(p.id))}
              >
                Take back
              </Small>
            </PersonRow>
          ))}
        </View>
      )}

      {blocked.length > 0 && (
        <View style={styles.card} testID="blocked">
          <Text style={styles.label}>Blocked</Text>
          {blocked.map((p) => (
            <PersonRow key={p.id} person={p}>
              <Small label={`Unblock ${p.username}`} quiet onPress={() => void act(messages.unblock(p.id))}>
                Unblock
              </Small>
            </PersonRow>
          ))}
        </View>
      )}
    </View>
  );
}

/** One player: picture, name and ID, with the buttons for them at the end. */
export function PersonRow({
  person,
  children,
}: {
  person: Pick<Person, 'username' | 'avatarUrl' | 'publicId'>;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row} testID={`person-${person.username}`}>
      <Avatar name={person.username} url={person.avatarUrl} size={40} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {person.username}
        </Text>
        <Text style={styles.id}>ID {person.publicId}</Text>
      </View>
      {children}
    </View>
  );
}

export function Small({
  label,
  onPress,
  on,
  danger,
  quiet,
  children,
}: {
  label: string;
  onPress: () => void;
  on?: boolean;
  danger?: boolean;
  quiet?: boolean;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.small, on && styles.smallOn, danger && styles.smallDanger, quiet && styles.smallQuiet]}
    >
      <Text style={[styles.smallText, (on || danger) && styles.smallDarkText, quiet && styles.smallQuietText]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  card: { backgroundColor: colors.table, borderRadius: 14, padding: 12, gap: 10 },
  confirm: { gap: 8, paddingVertical: 4 },
  confirmText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 340 },
  strong: { color: colors.text, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  primary: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#2A2A2A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  names: { flex: 1, gap: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  id: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  small: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 2, borderColor: colors.textMuted },
  smallText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  smallOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  smallDarkText: { color: '#2A2A2A', fontWeight: '800' },
  smallQuiet: { borderColor: 'transparent', paddingHorizontal: 6 },
  smallQuietText: { color: colors.textMuted, textDecorationLine: 'underline' },
  good: { color: colors.meld, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
