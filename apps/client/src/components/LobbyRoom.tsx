import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Ack, LobbySettings, LobbyState } from '@gur/server/protocol';
import { Avatar } from './Avatar';
import { InviteFriends } from './InviteFriends';
import { avatarColor } from './PlayerPanel';
import { colors } from '@/theme';

type Props = {
  lobby: LobbyState;
  onSettings: (change: Partial<LobbySettings>) => Promise<Ack>;
  onStart: () => Promise<Ack>;
  onLeave: () => void;
  /** The leader invites a friend (their account id). */
  onInvite: (userId: string) => Promise<Ack<{ seconds: number }>>;
};

const ROUNDS = [1, 3, 5] as const;
const SEATS = 4;

/**
 * The waiting room. Everybody sees the code and who has joined. The lobby leader (who created
 * it) also invites friends, chooses the options and starts the game; the others wait for them.
 */
export function LobbyRoom({ lobby, onSettings, onStart, onLeave, onInvite }: Props) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<'shared' | 'copied' | null>(null);
  const you = lobby.members[lobby.you]!;
  const host = lobby.members.find((m) => m.host);
  const { settings } = lobby;
  const enough = lobby.members.length >= 2 || settings.fillWithBots;

  /** Shows the server's reason when it refuses something. */
  const run = async (request: Promise<Ack>) => {
    const answer = await request;
    setError(answer.ok ? null : answer.error);
  };

  const share = async () => {
    const message = `Join my game of Gur with the code ${lobby.code}`;
    try {
      // On a phone this opens the share sheet; where there is none, the code is copied instead.
      const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!canShare && clipboard) {
        await clipboard.writeText(lobby.code);
        setShared('copied');
      } else {
        await Share.share({ message });
        setShared('shared');
      }
    } catch {
      // The player closed the share sheet: nothing to do.
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: 24 + insets.top,
          paddingBottom: 24 + insets.bottom,
          paddingLeft: 24 + insets.left,
          paddingRight: 24 + insets.right,
        },
      ]}
    >
      <Text style={styles.label}>Lobby code</Text>
      <Text style={styles.code} testID="lobby-code" accessibilityLabel={`Lobby code ${lobby.code.split('').join(' ')}`}>
        {lobby.code}
      </Text>
      <Text style={styles.hint}>Your friends tap &quot;Play with friends&quot; and type this code.</Text>
      <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.secondary}>
        <Text style={styles.secondaryText}>
          {shared === 'copied' ? 'Code copied' : shared === 'shared' ? 'Shared' : 'Share the code'}
        </Text>
      </Pressable>

      <View style={styles.card} testID="members">
        {Array.from({ length: SEATS }, (_, i) => {
          const member = lobby.members[i];
          if (!member) {
            return (
              <View key={i} style={styles.member}>
                <View style={[styles.avatar, styles.avatarEmpty]} />
                <Text style={styles.empty}>
                  {settings.fillWithBots ? 'A bot will sit here' : 'Waiting for a player…'}
                </Text>
              </View>
            );
          }
          return (
            <View key={i} style={styles.member} testID="member">
              <Avatar
                name={member.name}
                url={member.avatarUrl}
                size={36}
                color={avatarColor(i)}
                testID={`picture-${i}`}
              />
              <Text style={styles.name} numberOfLines={1}>
                {member.name}
                {i === lobby.you ? ' (you)' : ''}
              </Text>
              {member.host && <Text style={styles.tag}>Leader</Text>}
              {!member.connected && <Text style={[styles.tag, styles.tagAway]}>Away</Text>}
            </View>
          );
        })}
      </View>

      {you.host && <InviteFriends lobby={lobby} onInvite={onInvite} />}

      {/* Only the leader chooses the options, so only the leader sees them. */}
      {you.host && (
        <View style={styles.card}>
          <View style={styles.option}>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Allow 12-13-1</Text>
              <Text style={styles.optionHint}>Some areas count 12, 13, 1 as a run. 13-1-2 never counts.</Text>
            </View>
            <Switch
              accessibilityLabel="Allow 12-13-1"
              value={settings.aceHigh}
              onValueChange={(aceHigh) => void run(onSettings({ aceHigh }))}
              trackColor={{ true: colors.accent, false: colors.tableDark }}
            />
          </View>
          <View style={styles.option}>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Fill empty seats with bots</Text>
              <Text style={styles.optionHint}>The table always has four players.</Text>
            </View>
            <Switch
              accessibilityLabel="Fill empty seats with bots"
              value={settings.fillWithBots}
              onValueChange={(fillWithBots) => void run(onSettings({ fillWithBots }))}
              trackColor={{ true: colors.accent, false: colors.tableDark }}
            />
          </View>
          <View style={styles.option}>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Rounds</Text>
              <Text style={styles.optionHint}>Points add up over the rounds; lowest total wins.</Text>
            </View>
            <View style={styles.rounds} accessibilityRole="radiogroup" accessibilityLabel="Rounds">
              {ROUNDS.map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityLabel={`${n} round${n === 1 ? '' : 's'}`}
                  accessibilityState={{ checked: settings.rounds === n }}
                  aria-checked={settings.rounds === n}
                  onPress={() => void run(onSettings({ rounds: n }))}
                  style={[styles.round, settings.rounds === n && styles.roundOn]}
                >
                  <Text style={[styles.roundText, settings.rounds === n && styles.roundTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {you.host ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !enough }}
            onPress={() => enough && void run(onStart())}
            style={({ pressed }) => [styles.primary, !enough && styles.dim, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Start the game</Text>
          </Pressable>
          {!enough && <Text style={styles.hint}>You need at least 2 players. Invite a friend, or turn on bots.</Text>}
        </>
      ) : (
        <Text style={styles.waiting} testID="waiting-for-host">
          Waiting for the lobby leader{host ? ` (${host.name})` : ''} to start the game…
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="lobby-error">
          {error}
        </Text>
      )}

      <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}>
        <Text style={styles.secondaryText}>Leave the lobby</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', gap: 14 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  code: { color: colors.text, fontSize: 52, fontWeight: '900', letterSpacing: 8, marginTop: -8 },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 320 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.tableDark, borderRadius: 14, padding: 12, gap: 10 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  avatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textMuted },
  initial: { color: colors.text, fontSize: 16, fontWeight: '800' },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  empty: { flex: 1, color: colors.textMuted, fontSize: 14 },
  tag: {
    color: '#2A2A2A',
    backgroundColor: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tagAway: { backgroundColor: colors.danger },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  optionHint: { color: colors.textMuted, fontSize: 12 },
  rounds: { flexDirection: 'row', gap: 6 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  roundOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  roundText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  roundTextOn: { color: '#2A2A2A' },
  primary: { backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 28 },
  primaryText: { fontSize: 17, fontWeight: '800', color: '#2A2A2A' },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  waiting: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', maxWidth: 320 },
});
