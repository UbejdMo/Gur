import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { Ack, LobbyState } from '@gur/server/protocol';
import { useAccount } from '@/account';
import { REPORT_REASONS } from '@/account/messages';
import type { ReportReason } from '@/account/messages';
import type { TableLine } from '@/online/connection';
import { EMOJIS, isEmoji, tableChatMemory, useTableChat } from '@/online/tableChat';
import { ChatIcon } from './icons';
import { avatarColor } from './PlayerPanel';
import { Popover } from './Popover';
import { colors } from '@/theme';

type Props = {
  lobby: LobbyState;
  chat: readonly TableLine[];
  onSay: (text: string) => Promise<Ack>;
  onReport: (chatId: string, why: string, note: string, alsoBlock: boolean) => Promise<Ack>;
  /** Smaller button, for the table on a short screen. */
  small?: boolean;
};

const MAX_LINE = 200;

/**
 * The chat at a table, or in the waiting room: a button with the number of unread lines, and
 * the panel it opens. In the panel, a tap on an emoji sends it at once; the box below is for
 * anything else. Each other player can be muted (for you) or, when both of you signed in,
 * reported.
 */
export function TableChat({ lobby, chat, onSay, onReport, small }: Props) {
  const [open, setOpen] = useState(false);
  const { unread } = useTableChat(lobby, chat);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `Chat, ${unread} unread` : 'Chat'}
        testID="table-chat-button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, small && styles.buttonSmall, pressed && styles.pressed]}
      >
        <ChatIcon size={small ? 14 : 18} />
        {unread > 0 && (
          <View style={styles.badge} testID="chat-unread">
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Pressable>
      <Popover title="Chat" open={open} onClose={() => setOpen(false)} testID="table-chat">
        <ChatPanel lobby={lobby} chat={chat} onSay={onSay} onReport={onReport} />
      </Popover>
    </>
  );
}

function ChatPanel({ lobby, chat, onSay, onReport }: Omit<Props, 'small'>) {
  const screen = useWindowDimensions();
  // A phone on its side: smaller emojis and no footnote, so the box and Send stay on screen.
  const low = screen.height < 520;
  const { profile } = useAccount();
  const { lines, muted } = useTableChat(lobby, chat);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const mine = lobby.members[lobby.you]?.chatId;
  const newest = chat.at(-1)?.id ?? 0;

  // While the panel is open, everything in it counts as read.
  useEffect(() => {
    tableChatMemory.seenUpTo(lobby.code, newest);
  }, [lobby.code, newest]);

  const say = async (what: string) => {
    if (busy) return;
    setBusy(true);
    const answer = await onSay(what);
    setBusy(false);
    setError(answer.ok ? null : answer.error);
    if (answer.ok && what === text) setText('');
  };

  const others = lobby.members.filter((m, i) => i !== lobby.you && !m.bot);
  const reportee = others.find((m) => m.chatId === reporting);

  return (
    <View style={styles.box}>
      {others.length > 0 && (
        <View style={styles.players} testID="chat-players">
          {others.map((member) => {
            const silent = muted.has(member.chatId);
            const canReport = Boolean(profile && member.publicId);
            return (
              <View key={member.chatId} style={styles.player}>
                <View style={[styles.dot, { backgroundColor: avatarColor(lobby.members.indexOf(member)) }]} />
                <Text style={styles.playerName} numberOfLines={1}>
                  {member.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={silent ? `Unmute ${member.name}` : `Mute ${member.name}`}
                  onPress={() => (silent ? tableChatMemory.unmute(member.chatId) : tableChatMemory.mute(member.chatId))}
                  style={styles.small}
                >
                  <Text style={styles.smallText}>{silent ? 'Unmute' : 'Mute'}</Text>
                </Pressable>
                {canReport && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Report ${member.name}`}
                    onPress={() => {
                      setNotice(null);
                      setReporting(member.chatId);
                    }}
                    style={styles.small}
                  >
                    <Text style={styles.smallText}>Report</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {notice && (
        <Text style={styles.good} testID="chat-notice">
          {notice}
        </Text>
      )}

      {reportee ? (
        <ReportForm
          name={reportee.name}
          onCancel={() => setReporting(null)}
          onSend={async (why, note, alsoBlock) => {
            const answer = await onReport(reportee.chatId, why, note, alsoBlock);
            if (!answer.ok) return answer.error;
            // Reported players are muted for you too.
            tableChatMemory.mute(reportee.chatId);
            setReporting(null);
            setNotice(
              `Thank you. Your report about ${reportee.name} was sent, and they are muted for you.${
                alsoBlock ? ' They are blocked too.' : ''
              }`,
            );
            return null;
          }}
        />
      ) : (
        <>
          <ScrollView
            ref={list}
            style={[
              styles.lines,
              {
                height: low
                  ? Math.max(56, Math.min(160, screen.height - 290))
                  : Math.max(90, Math.min(260, screen.height - 420)),
              },
            ]}
            contentContainerStyle={styles.linesInner}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            testID="chat-lines"
          >
            {lines.length === 0 && <Text style={styles.empty}>Nothing said yet. Say hello, or send an emoji.</Text>}
            {lines.map((line) => (
              <View key={line.id} style={styles.line} testID={line.from === mine ? 'chat-mine' : 'chat-theirs'}>
                <Text style={[styles.lineName, { color: avatarColor(line.seat) }]}>
                  {line.from === mine ? 'You' : line.name}
                </Text>
                <Text style={[styles.lineText, isEmoji(line.text) && styles.lineEmoji]} selectable>
                  {line.text}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.emojis} accessibilityLabel="Emojis: a tap sends one">
            {EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`Send ${emoji}`}
                onPress={() => void say(emoji)}
                style={({ pressed }) => [styles.emoji, low && styles.emojiLow, pressed && styles.emojiPressed]}
              >
                <Text style={[styles.emojiText, low && styles.emojiTextLow]}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Message to the table"
              value={text}
              onChangeText={setText}
              maxLength={MAX_LINE}
              placeholder="Say something"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              onSubmitEditing={() => void say(text)}
              submitBehavior="submit"
              returnKeyType="send"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={() => void say(text)}
              disabled={busy}
              style={({ pressed }) => [styles.send, busy && styles.dim, pressed && styles.pressed]}
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
          {error && (
            <Text style={styles.error} testID="chat-error">
              {error}
            </Text>
          )}
          {!low && <Text style={styles.hint}>The chat is not kept: it is gone when the lobby closes.</Text>}
        </>
      )}
    </View>
  );
}

function ReportForm({
  name,
  onCancel,
  onSend,
}: {
  name: string;
  onCancel: () => void;
  onSend: (why: ReportReason, note: string, alsoBlock: boolean) => Promise<string | null>;
}) {
  const [why, setWhy] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!why) {
      setError('Choose a reason');
      return;
    }
    setBusy(true);
    setError(await onSend(why, note.trim(), alsoBlock));
    setBusy(false);
  };

  return (
    <View style={styles.card} testID="chat-report">
      <Text style={styles.cardText}>
        Report {name}. The game&apos;s owner sees your report with what {name} said at this table, and nobody else. They
        are not told who reported them.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reason" style={styles.reasons}>
        {REPORT_REASONS.map(({ reason, label }) => {
          const on = why === reason;
          return (
            <Pressable
              key={reason}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => setWhy(reason)}
              style={[styles.reason, on && styles.reasonOn]}
            >
              <View style={[styles.radio, on && styles.radioOn]} />
              <Text style={styles.reasonText}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel="What happened (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        placeholder="What happened? (optional)"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, styles.note]}
      />
      <View style={styles.option}>
        <Text style={styles.optionText}>Also block {name}</Text>
        <Switch
          accessibilityLabel={`Also block ${name}`}
          value={alsoBlock}
          onValueChange={setAlsoBlock}
          trackColor={{ true: colors.accent, false: colors.tableDark }}
        />
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void send()}
          disabled={busy}
          style={({ pressed }) => [styles.send, busy && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.sendText}>Send report</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.small}>
          <Text style={styles.smallText}>Cancel</Text>
        </Pressable>
      </View>
      {error && (
        <Text style={styles.error} testID="chat-report-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.backdropPanel,
  },
  buttonSmall: { padding: 4, borderRadius: 7 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.jokerBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  box: { gap: 10 },
  players: { gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  playerName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  small: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.textMuted },
  smallText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  lines: { backgroundColor: colors.table, borderRadius: 12 },
  linesInner: { padding: 10, gap: 6, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  lineName: { fontSize: 13, fontWeight: '900' },
  lineText: { color: colors.text, fontSize: 14, flexShrink: 1 },
  lineEmoji: { fontSize: 24 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  emoji: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.table,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiLow: { width: 36, height: 36, borderRadius: 10 },
  emojiTextLow: { fontSize: 20 },
  emojiPressed: { backgroundColor: colors.felt, transform: [{ scale: 0.92 }] },
  emojiText: { fontSize: 24 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  note: { flex: 0, minHeight: 64, borderRadius: 12, textAlignVertical: 'top' },
  send: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20 },
  sendText: { color: '#2A2A2A', fontSize: 14, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  good: { color: colors.meld, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  card: { backgroundColor: colors.table, borderRadius: 14, padding: 12, gap: 10 },
  cardText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  reasons: { gap: 2 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  reasonOn: { backgroundColor: colors.tableDark },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.textMuted },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  reasonText: { color: colors.text, fontSize: 14 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
