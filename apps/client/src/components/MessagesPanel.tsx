import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { friends, messages, useFriends, useMessages } from '@/account';
import { MAX_MESSAGE, MAX_NOTE, REPORT_REASONS, sendProblem, when } from '@/account/messages';
import type { Chat, Line, ReportReason } from '@/account/messages';
import { Avatar } from './Avatar';
import { PersonRow, Small } from './FriendsPanel';
import { ChatIcon } from './icons';
import { colors } from '@/theme';

/** Who a conversation is with. */
export type Other = { id: string; username: string; avatarUrl: string | null; publicId: string };

type Props = {
  /** Open straight on the conversation with this player (from the friends panel). */
  start?: Other | null;
};

/** How often an open conversation looks for news, in case a nudge from the server was missed. */
const LOOK_EVERY_MS = 15_000;

/**
 * Your messages, under the speech bubble at the top right: the conversations, latest first,
 * with unread counts, and your friends you have not written to yet. A conversation opens in
 * the same panel, where a player can also be blocked or reported.
 */
export function MessagesPanel({ start = null }: Props) {
  const [other, setOther] = useState<Other | null>(start);
  const [notice, setNotice] = useState<string | null>(null);
  if (other) {
    return (
      <Conversation
        other={other}
        onBack={(said) => {
          setNotice(said ?? null);
          setOther(null);
        }}
      />
    );
  }
  return (
    <Conversations
      notice={notice}
      onOpen={(o) => {
        setNotice(null);
        setOther(o);
      }}
    />
  );
}

function Conversations({ notice, onOpen }: { notice: string | null; onOpen: (other: Other) => void }) {
  const { status, chats } = useMessages();
  const { people } = useFriends();
  useEffect(() => {
    void messages.refresh();
  }, []);
  const talked = new Set(chats.map((c) => c.id));
  const quiet = people.filter((p) => p.state === 'friend' && !talked.has(p.id));

  return (
    <View style={styles.box} testID="conversations">
      {notice && (
        <Text style={styles.good} testID="messages-notice">
          {notice}
        </Text>
      )}
      {chats.length === 0 && quiet.length === 0 && (
        <View style={styles.emptyBox}>
          <ChatIcon size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {status === 'failed'
              ? 'Your messages could not be fetched. Check your connection.'
              : status === 'ready'
                ? 'No messages yet. Add friends with the friends button, then write to them here.'
                : 'One moment…'}
          </Text>
        </View>
      )}
      {chats.map((chat) => (
        <ChatRow key={chat.id} chat={chat} onPress={() => onOpen(chat)} />
      ))}
      {quiet.length > 0 && (
        <View style={styles.card} testID="write-to">
          <Text style={styles.label}>Write to a friend</Text>
          {quiet.map((p) => (
            <PersonRow key={p.id} person={p}>
              <Small label={`Write to ${p.username}`} on onPress={() => onOpen(p)}>
                Write
              </Small>
            </PersonRow>
          ))}
        </View>
      )}
    </View>
  );
}

function ChatRow({ chat, onPress }: { chat: Chat; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${chat.username}${chat.unread ? `, ${chat.unread} unread` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chat, pressed && styles.pressed]}
      testID={`chat-${chat.username}`}
    >
      <Avatar name={chat.username} url={chat.avatarUrl} size={44} />
      <View style={styles.chatText}>
        <View style={styles.chatTop}>
          <Text style={[styles.name, chat.unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {chat.username}
          </Text>
          <Text style={styles.time}>{when(chat.lastAt)}</Text>
        </View>
        <View style={styles.chatTop}>
          <Text style={[styles.preview, chat.unread > 0 && styles.previewUnread]} numberOfLines={1}>
            {chat.lastFromMe ? `You: ${chat.lastBody}` : chat.lastBody}
          </Text>
          {chat.unread > 0 && (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>{chat.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

type Mode = 'chat' | 'block' | 'report' | 'reported';

function Conversation({ other, onBack }: { other: Other; onBack: (notice?: string) => void }) {
  const screen = useWindowDimensions();
  const { threads } = useMessages();
  const { status: friendsStatus, people } = useFriends();
  const thread = threads[other.id];
  const [mode, setMode] = useState<Mode>('chat');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<{ blocked: boolean } | null>(null);
  const list = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    void messages.open(other.id);
    // Whether you can still write depends on being friends: look at the list now.
    void friends.refresh();
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void messages.news(other.id);
    }, LOOK_EVERY_MS);
    return () => {
      clearInterval(timer);
      messages.close(other.id);
    };
  }, [other.id]);

  // You can write while you are friends. Until the list is in, assume you still are.
  const friend = people.some((p) => p.id === other.id && p.state === 'friend');
  const canWrite = friend || friendsStatus === 'idle' || friendsStatus === 'loading';

  const send = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await messages.send(other.id, text);
    setBusy(false);
    setError(answer.message);
    if (answer.ok) setText('');
    // Refused because you are not friends any more: the list is out of date, and the box goes.
    if (answer.message === sendProblem('not_friends')) void friends.refresh();
  };

  const block = async () => {
    setBusy(true);
    const problem = await messages.block(other.id);
    setBusy(false);
    if (problem) {
      setError(problem);
      setMode('chat');
      return;
    }
    void friends.refresh();
    onBack(`You blocked ${other.username}. You can unblock them in Friends.`);
  };

  const lines = thread?.lines ?? [];
  const lastMine = [...lines].reverse().find((l) => l.fromMe);

  return (
    <View style={styles.box} testID="conversation">
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All messages"
          onPress={() => onBack()}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Avatar name={other.username} url={other.avatarUrl} size={36} />
        <Text style={styles.headName} numberOfLines={1} accessibilityRole="header">
          {other.username}
        </Text>
        {mode === 'chat' && (
          <>
            <Small label={`Report ${other.username}`} quiet onPress={() => setMode('report')}>
              Report
            </Small>
            <Small label={`Block ${other.username}`} quiet onPress={() => setMode('block')}>
              Block
            </Small>
          </>
        )}
      </View>

      {mode === 'block' && (
        <View style={styles.card} testID="block-confirm">
          <Text style={styles.confirmText}>
            Block {other.username}? You stop being friends, and neither of you can send the other a message or a friend
            request. They are not told. You can unblock them later in Friends.
          </Text>
          <View style={styles.row}>
            <Small label={`Yes, block ${other.username}`} danger onPress={() => void block()}>
              Block
            </Small>
            <Small label="Cancel" onPress={() => setMode('chat')}>
              Cancel
            </Small>
          </View>
        </View>
      )}

      {mode === 'report' && (
        <ReportForm
          other={other}
          onCancel={() => setMode('chat')}
          onSent={(blocked) => {
            setReported({ blocked });
            setMode('reported');
          }}
        />
      )}

      {mode === 'reported' && reported && (
        <View style={styles.card} testID="report-sent">
          <Text style={styles.confirmText}>
            Thank you. Your report was sent, and it will be looked at.
            {reported.blocked ? ` ${other.username} is blocked.` : ''}
          </Text>
          <Small
            label={reported.blocked ? 'Back to all messages' : 'Back to the conversation'}
            on
            onPress={() => (reported.blocked ? onBack() : setMode('chat'))}
          >
            {reported.blocked ? 'Back to all messages' : 'Back to the conversation'}
          </Small>
        </View>
      )}

      {mode === 'chat' && (
        <>
          <ScrollView
            ref={list}
            style={[
              styles.lines,
              // What is left of the screen once the panel's title, the header and the box to type in
              // have their room: so on a short screen (a phone held sideways) everything still shows.
              { height: Math.max(110, Math.min(380, screen.height - 310)) },
            ]}
            contentContainerStyle={styles.linesInner}
            testID="lines"
            onContentSizeChange={() => {
              // Follow new messages at the bottom; keep the place when older ones come in at the top.
              const newest = lines.at(-1)?.id ?? null;
              if (newest !== lastId.current) {
                lastId.current = newest;
                list.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            {thread?.more && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void messages.loadEarlier(other.id)}
                style={styles.earlier}
              >
                <Text style={styles.earlierText}>Show earlier messages</Text>
              </Pressable>
            )}
            {thread?.status === 'loading' && <Text style={styles.emptyText}>One moment…</Text>}
            {thread?.status === 'failed' && (
              <Text style={styles.emptyText}>The messages could not be fetched. Check your connection.</Text>
            )}
            {thread?.status === 'ready' && lines.length === 0 && (
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            )}
            {lines.map((line) => (
              <Bubble key={line.id} line={line} seen={line === lastMine && line.readAt !== null} />
            ))}
          </ScrollView>

          {canWrite ? (
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel={`Message to ${other.username}`}
                value={text}
                onChangeText={setText}
                maxLength={MAX_MESSAGE}
                placeholder="Message"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                onSubmitEditing={() => void send()}
                submitBehavior="submit"
                returnKeyType="send"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                onPress={() => void send()}
                disabled={busy}
                style={({ pressed }) => [styles.send, busy && styles.dim, pressed && styles.pressed]}
              >
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint} testID="not-friends">
              You are not friends with {other.username}, so you cannot write to them.
            </Text>
          )}
          {text.length > MAX_MESSAGE - 50 && (
            <Text style={styles.hint}>
              {text.length} / {MAX_MESSAGE}
            </Text>
          )}
          {error && (
            <Text style={styles.error} testID="message-error">
              {error}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function Bubble({ line, seen }: { line: Line; seen: boolean }) {
  return (
    <View
      style={[styles.bubbleWrap, line.fromMe ? styles.mine : styles.theirs]}
      testID={line.fromMe ? 'mine' : 'theirs'}
    >
      <View style={[styles.bubble, line.fromMe ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, line.fromMe && styles.bubbleTextMine]} selectable>
          {line.body}
        </Text>
      </View>
      <Text style={styles.bubbleTime}>
        {when(line.at)}
        {seen ? ' · Seen' : ''}
      </Text>
    </View>
  );
}

function ReportForm({
  other,
  onCancel,
  onSent,
}: {
  other: Other;
  onCancel: () => void;
  onSent: (blocked: boolean) => void;
}) {
  const [why, setWhy] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    let problem = await messages.report(other.id, why, note);
    if (!problem && alsoBlock) {
      problem = await messages.block(other.id);
      void friends.refresh();
    }
    setBusy(false);
    setError(problem);
    if (!problem) onSent(alsoBlock);
  };

  return (
    <View style={styles.card} testID="report-form">
      <Text style={styles.confirmText}>
        Report {other.username}. The game&apos;s owner sees your report with your last messages together, and nobody
        else. {other.username} is not told who reported them.
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
              <View style={[styles.dot, on && styles.dotOn]} />
              <Text style={styles.reasonText}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel="What happened (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={MAX_NOTE}
        multiline
        placeholder="What happened? (optional)"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, styles.note]}
      />
      <View style={styles.option}>
        <Text style={styles.optionText}>Also block {other.username}</Text>
        <Switch
          accessibilityLabel={`Also block ${other.username}`}
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
        <Small label="Cancel" onPress={onCancel}>
          Cancel
        </Small>
      </View>
      {error && (
        <Text style={styles.error} testID="report-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  card: { backgroundColor: colors.table, borderRadius: 14, padding: 12, gap: 10 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  chat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.table,
  },
  chatText: { flex: 1, gap: 2 },
  chatTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  nameUnread: { fontWeight: '900' },
  time: { color: colors.textMuted, fontSize: 12 },
  preview: { flex: 1, color: colors.textMuted, fontSize: 13 },
  previewUnread: { color: colors.text, fontWeight: '700' },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.jokerBox,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  backText: { color: colors.text, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  headName: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '900' },
  lines: { backgroundColor: colors.table, borderRadius: 14 },
  linesInner: { padding: 10, gap: 8, flexGrow: 1, justifyContent: 'flex-end' },
  earlier: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  earlierText: { color: colors.accent, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  bubbleWrap: { maxWidth: '82%', gap: 2 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.tile, borderBottomLeftRadius: 4 },
  bubbleText: { color: '#1B1B1B', fontSize: 15, lineHeight: 20 },
  bubbleTextMine: { color: '#2A2A2A' },
  bubbleTime: { color: colors.textMuted, fontSize: 11 },
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
  note: { flex: 0, minHeight: 70, borderRadius: 12, textAlignVertical: 'top' },
  send: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20 },
  sendText: { color: '#2A2A2A', fontSize: 14, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 13 },
  good: { color: colors.meld, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
  confirmText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  reasons: { gap: 4 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  reasonOn: { backgroundColor: colors.tableDark },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textMuted },
  dotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  reasonText: { color: colors.text, fontSize: 14 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
