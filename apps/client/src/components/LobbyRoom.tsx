import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Ack, LobbySettings, LobbyState } from '@gur/server/protocol';
import { Avatar } from './Avatar';
import { InviteFriends } from './InviteFriends';
import { TableChat } from './TableChat';
import type { TableLine } from '@/online/connection';
import { useCountdown } from '@/online/useOnlineTable';
import { avatarColor } from './PlayerPanel';
import { colors } from '@/theme';
import { useT } from '@/i18n';

type Props = {
  lobby: LobbyState;
  onSettings: (change: Partial<LobbySettings>) => Promise<Ack>;
  onStart: () => Promise<Ack>;
  onLeave: () => void;
  /** The leader invites a friend (their account id). */
  onInvite: (userId: string) => Promise<Ack<{ seconds: number }>>;
  /** The chat in the waiting room (it carries on at the table). */
  chat?: readonly TableLine[];
  onSay?: (text: string) => Promise<Ack>;
  onReport?: (chatId: string, why: string, note: string, alsoBlock: boolean) => Promise<Ack>;
  /** Server clock minus this device's: for the countdown at a public table. */
  clockOffset?: number;
};

const ROUNDS = [1, 3, 5] as const;
const SEATS = 4;

/**
 * The waiting room. Everybody sees the code and who has joined. The lobby leader (who created
 * it) also invites friends, chooses the options and starts the game; the others wait for them.
 * A public table (Play online) has no leader: it shows how long until it starts by itself.
 */
export function LobbyRoom(props: Props) {
  if (props.lobby.kind === 'public') return <PublicTable {...props} />;
  return <FriendsLobby {...props} />;
}

function FriendsLobby({ lobby, onSettings, onStart, onLeave, onInvite, chat, onSay, onReport }: Props) {
  const t = useT();
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
    const message = t.lobby.shareText(lobby.code);
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
      {onSay && onReport && (
        <View style={styles.chatCorner}>
          <TableChat lobby={lobby} chat={chat ?? []} onSay={onSay} onReport={onReport} />
        </View>
      )}
      <Text style={styles.label}>{t.lobby.code}</Text>
      <Text style={styles.code} testID="lobby-code" accessibilityLabel={t.lobby.codeSpoken(lobby.code)}>
        {lobby.code}
      </Text>
      <Text style={styles.hint}>{t.lobby.codeHint}</Text>
      <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.secondary}>
        <Text style={styles.secondaryText}>
          {shared === 'copied' ? t.lobby.copied : shared === 'shared' ? t.lobby.shared : t.lobby.share}
        </Text>
      </Pressable>

      <View style={styles.card} testID="members">
        {Array.from({ length: SEATS }, (_, i) => {
          const member = lobby.members[i];
          if (!member) {
            return (
              <View key={i} style={styles.member}>
                <View style={[styles.avatar, styles.avatarEmpty]} />
                <Text style={styles.empty}>{settings.fillWithBots ? t.lobby.botSeat : t.lobby.waitingSeat}</Text>
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
                {i === lobby.you ? t.common.youMark : ''}
              </Text>
              {member.host && <Text style={styles.tag}>{t.lobby.leader}</Text>}
              {!member.connected && <Text style={[styles.tag, styles.tagAway]}>{t.common.away}</Text>}
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
              <Text style={styles.optionTitle}>{t.common.allowAceHigh}</Text>
              <Text style={styles.optionHint}>{t.common.aceHighHint}</Text>
            </View>
            <Switch
              accessibilityLabel={t.common.allowAceHigh}
              value={settings.aceHigh}
              onValueChange={(aceHigh) => void run(onSettings({ aceHigh }))}
              trackColor={{ true: colors.accent, false: colors.tableDark }}
            />
          </View>
          <View style={styles.option}>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{t.lobby.fillBots}</Text>
              <Text style={styles.optionHint}>{t.lobby.fillBotsHint}</Text>
            </View>
            <Switch
              accessibilityLabel={t.lobby.fillBots}
              value={settings.fillWithBots}
              onValueChange={(fillWithBots) => void run(onSettings({ fillWithBots }))}
              trackColor={{ true: colors.accent, false: colors.tableDark }}
            />
          </View>
          <View style={styles.option}>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{t.lobby.rounds}</Text>
              <Text style={styles.optionHint}>{t.lobby.roundsHint}</Text>
            </View>
            <View style={styles.rounds} accessibilityRole="radiogroup" accessibilityLabel={t.lobby.rounds}>
              {ROUNDS.map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityLabel={t.lobby.roundsCount(n)}
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
            <Text style={styles.primaryText}>{t.common.startGame}</Text>
          </Pressable>
          {!enough && <Text style={styles.hint}>{t.lobby.needTwo}</Text>}
        </>
      ) : (
        <Text style={styles.waiting} testID="waiting-for-host">
          {t.lobby.waitingFor(host?.name ?? null)}
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="lobby-error">
          {error}
        </Text>
      )}

      <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}>
        <Text style={styles.secondaryText}>{t.lobby.leave}</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * Waiting at a public table: the seats filling up, how long until the game starts, and the code,
 * so a friend can sit down too. There are no bots online: the game starts with four players, or
 * with the two or three who are there 30 seconds after the second sat down. A player alone keeps
 * waiting, with no clock.
 */
function PublicTable({ lobby, onLeave, chat, onSay, onReport, clockOffset = 0 }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  // A phone on its side: the seats on the left, the choices on the right, all on one screen.
  const low = screen.height < 520 && screen.width > screen.height;
  const left = useCountdown(lobby.startsAt, clockOffset);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: (low ? 14 : 24) + insets.top,
          paddingBottom: 24 + insets.bottom,
          paddingLeft: 24 + insets.left,
          paddingRight: 24 + insets.right,
        },
      ]}
    >
      {onSay && onReport && (
        <View style={low ? [styles.chatFloat, { top: 12 + insets.top, right: 12 + insets.right }] : styles.chatCorner}>
          <TableChat lobby={lobby} chat={chat ?? []} onSay={onSay} onReport={onReport} small={low} />
        </View>
      )}
      <View style={low ? styles.halves : styles.stack}>
        <View style={low ? styles.half : styles.stack}>
          <Text style={[styles.title, low && styles.titleLow]} accessibilityRole="header">
            {t.lobby.finding}
          </Text>
          <Text style={styles.waiting} testID="match-status" accessibilityLiveRegion="polite">
            {lobby.startsAt !== null ? t.lobby.startsIn(left) : t.lobby.lookingAlone}
          </Text>

          <View style={styles.card} testID="members">
            {Array.from({ length: SEATS }, (_, i) => {
              const member = lobby.members[i];
              if (!member) {
                return (
                  <View key={i} style={styles.member}>
                    <View style={[styles.avatar, styles.avatarEmpty]} />
                    <Text style={styles.empty}>{t.lobby.lookingSeat}</Text>
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
                    {i === lobby.you ? t.common.youMark : ''}
                  </Text>
                  {!member.connected && <Text style={[styles.tag, styles.tagAway]}>{t.common.away}</Text>}
                </View>
              );
            })}
          </View>
        </View>
        <View style={low ? [styles.half, styles.halfRight] : styles.stack}>
          <Text style={styles.hint} testID="table-rules">
            {lobby.settings.aceHigh ? t.lobby.rulesAceHigh : t.lobby.rulesNoAceHigh} · {t.lobby.oneRound}
          </Text>

          <Text style={styles.hint} testID="lobby-code" accessibilityLabel={t.lobby.codeSpoken(lobby.code)}>
            {t.lobby.friendCanSit} <Text style={styles.codeInline}>{lobby.code}</Text>
          </Text>

          <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t.lobby.stopLooking}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  titleLow: { fontSize: 22, marginTop: 0 },
  stack: { width: '100%', alignItems: 'center', gap: 14 },
  halves: { flexDirection: 'row', width: '100%', maxWidth: 860, gap: 24, alignItems: 'center' },
  half: { flex: 1, alignItems: 'center', gap: 10 },
  halfRight: { gap: 12 },
  chatFloat: { position: 'absolute', zIndex: 2 },
  codeInline: { color: colors.text, fontWeight: '900', letterSpacing: 2 },
  chatCorner: { alignSelf: 'flex-end', marginBottom: -12 },
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
