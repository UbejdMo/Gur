import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import { Friends } from '@/account/friends';
import type { FriendsBackend, Person } from '@/account/friends';
import { Messages, PAGE, REPORT_REASONS, reportProblem, sendProblem, when } from '@/account/messages';
import type { Blocked, Chat, Line, MessagesBackend, ReportReason, SendStatus } from '@/account/messages';
import { FriendsPanel } from '@/components/FriendsPanel';
import { MessagesPanel } from '@/components/MessagesPanel';

// The app's messages and friends are swapped for stores over stand-in services, new in each test.
const mockHolder: { messages: Messages | null; friends: Friends | null } = { messages: null, friends: null };
jest.mock('@/account', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  return {
    get messages() {
      return mockHolder.messages;
    },
    get friends() {
      return mockHolder.friends;
    },
    useMessages: () => {
      const store = mockHolder.messages!;
      return useSyncExternalStore(store.subscribe, store.get, store.get);
    },
    useFriends: () => {
      const store = mockHolder.friends!;
      return useSyncExternalStore(store.subscribe, store.get, store.get);
    },
  };
});

const ME = { id: 'me', publicId: '48213377', username: 'Ana', avatarUrl: null };
const person = (username: string, state: Person['state']): Person => ({
  id: `id-${username}`,
  publicId: String(10000000 + username.length),
  username,
  avatarUrl: null,
  state,
});
const at = (minute: number) => new Date(2026, 10, 21, 9, minute).toISOString();

/**
 * A stand-in for the database: conversations between "me" and others, friends, and blocks.
 * Behaves like supabase/migrations/0004_messages.sql, in short.
 */
function fakeDatabase(start: { friends?: string[]; lines?: Record<string, [boolean, string][]>; down?: boolean } = {}) {
  let next = 1;
  const friendNames = new Set(start.friends ?? []);
  const threads = new Map<string, Line[]>();
  const unread = new Map<string, number>();
  const blocked: Blocked[] = [];
  const reports: { who: string; why: ReportReason; note: string }[] = [];
  const calls: string[] = [];
  for (const [name, lines] of Object.entries(start.lines ?? {})) {
    threads.set(
      `id-${name}`,
      lines.map(([fromMe, body]) => ({ id: next, fromMe, body, at: at(next++), readAt: null })),
    );
    unread.set(`id-${name}`, lines.filter(([fromMe]) => !fromMe).length);
  }
  const fail = () => Promise.reject(new Error('offline'));
  const backend: MessagesBackend = {
    conversations: () => {
      if (start.down) return fail();
      const chats: Chat[] = [...threads.entries()]
        .filter(([id, lines]) => lines.length && !blocked.some((b) => b.id === id))
        .map(([id, lines]) => {
          const last = lines.at(-1)!;
          const name = id.slice(3);
          return {
            id,
            publicId: String(10000000 + name.length),
            username: name,
            avatarUrl: null,
            lastBody: last.body,
            lastAt: last.at,
            lastFromMe: last.fromMe,
            unread: unread.get(id) ?? 0,
          };
        })
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      return Promise.resolve(chats);
    },
    thread: (other, beforeId) => {
      if (start.down) return fail();
      calls.push(`thread:${other}:${beforeId ?? '-'}`);
      const lines = (threads.get(other) ?? []).filter((l) => beforeId === null || l.id < beforeId);
      return Promise.resolve(lines.slice(-PAGE).reverse());
    },
    send: (to, body) => {
      calls.push(`send:${to}:${body}`);
      if (start.down) return fail();
      const name = to.slice(3);
      if (!friendNames.has(name)) return Promise.resolve({ status: 'not_friends' as SendStatus, line: null });
      if (body === 'spam spam') return Promise.resolve({ status: 'too_fast' as SendStatus, line: null });
      const line: Line = { id: next, fromMe: true, body, at: at(next++), readAt: null };
      threads.set(to, [...(threads.get(to) ?? []), line]);
      return Promise.resolve({ status: 'sent' as SendStatus, line });
    },
    markRead: (other) => {
      calls.push(`read:${other}`);
      unread.set(other, 0);
      return Promise.resolve();
    },
    block: (who) => {
      calls.push(`block:${who}`);
      if (start.down) return fail();
      const name = who.slice(3);
      friendNames.delete(name);
      blocked.unshift({ id: who, publicId: '1', username: name, avatarUrl: null });
      return Promise.resolve();
    },
    unblock: (who) => {
      calls.push(`unblock:${who}`);
      blocked.splice(
        blocked.findIndex((b) => b.id === who),
        1,
      );
      return Promise.resolve();
    },
    blocks: () => Promise.resolve([...blocked]),
    report: (who, why, note) => {
      reports.push({ who, why, note });
      return Promise.resolve(reports.length > 3 ? 'too_many' : 'sent');
    },
  };
  /** A friend writes to me. */
  const arrive = (name: string, body: string) => {
    const id = `id-${name}`;
    threads.set(id, [...(threads.get(id) ?? []), { id: next, fromMe: false, body, at: at(next++), readAt: null }]);
    unread.set(id, (unread.get(id) ?? 0) + 1);
  };
  const friendsBackend: FriendsBackend = {
    list: () => Promise.resolve([...friendNames].map((n) => person(n, 'friend'))),
    add: () => Promise.resolve({ status: 'sent', username: null }),
    accept: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
  return { backend, friendsBackend, calls, reports, arrive, threads };
}

async function stores(start: Parameters<typeof fakeDatabase>[0] = {}) {
  const db = fakeDatabase(start);
  const messages = new Messages(db.backend);
  const friends = new Friends(db.friendsBackend);
  const pokes: string[] = [];
  messages.setPoke((to) => pokes.push(to));
  await friends.refresh();
  mockHolder.messages = messages;
  mockHolder.friends = friends;
  return { ...db, messages, friends, pokes };
}

beforeEach(() => {
  mockHolder.messages = new Messages(null);
  mockHolder.friends = new Friends(null);
});

describe('the messages store', () => {
  it('does nothing without accounts', async () => {
    const messages = new Messages(null);
    await messages.refresh();
    await messages.open('x');
    expect(messages.get()).toMatchObject({ status: 'idle', chats: [], unread: 0 });
    expect(await messages.send('x', 'hi')).toEqual({ ok: false, message: 'Sign in first' });
    expect(await messages.block('x')).toBe('Sign in first');
    expect(await messages.unblock('x')).toBe('Sign in first');
    expect(await messages.report('x', 'spam', '')).toBe('Sign in first');
  });

  it('lists conversations with the unread total; opening one reads it', async () => {
    const { messages, calls } = await stores({
      friends: ['Ben', 'Cem'],
      lines: {
        Ben: [
          [false, 'Hi'],
          [false, 'You there?'],
        ],
        Cem: [[true, 'Hello Cem']],
      },
    });
    await messages.refresh();
    expect(messages.get().chats.map((c) => `${c.username}:${c.unread}`)).toEqual(['Cem:0', 'Ben:2']);
    expect(messages.get().unread).toBe(2);
    await messages.open('id-Ben');
    expect(messages.get().threads['id-Ben']!.lines.map((l) => l.body)).toEqual(['Hi', 'You there?']);
    expect(calls).toContain('read:id-Ben');
    expect(messages.get().unread).toBe(0);
  });

  it('sends: the line shows at once, the friend is poked, and problems come in words', async () => {
    const { messages, pokes } = await stores({ friends: ['Ben'] });
    expect(await messages.send('id-Ben', '   ')).toEqual({ ok: false, message: 'Type a message first' });
    expect(await messages.send('id-Ben', 'x'.repeat(501))).toEqual({
      ok: false,
      message: expect.stringMatching(/500/),
    });
    expect(await messages.send('id-Ben', '  Hi Ben  ')).toEqual({ ok: true, message: null });
    expect(messages.get().threads['id-Ben']!.lines.map((l) => l.body)).toEqual(['Hi Ben']);
    expect(pokes).toEqual(['id-Ben']);
    expect(await messages.send('id-Zed', 'hello')).toEqual({
      ok: false,
      message: 'You can only write to your friends',
    });
    expect(await messages.send('id-Ben', 'spam spam')).toEqual({
      ok: false,
      message: expect.stringMatching(/very fast/),
    });
    expect(pokes).toHaveLength(1);
  });

  it('news from the server fetches the new message; on screen it is read at once, otherwise counted', async () => {
    const { messages, arrive, calls } = await stores({ friends: ['Ben', 'Cem'], lines: { Ben: [[true, 'Hi']] } });
    await messages.open('id-Ben');
    arrive('Ben', 'Hello back');
    await messages.news('id-Ben');
    expect(messages.get().threads['id-Ben']!.lines.map((l) => l.body)).toEqual(['Hi', 'Hello back']);
    expect(messages.get().unread).toBe(0);
    expect(calls.filter((c) => c === 'read:id-Ben').length).toBeGreaterThanOrEqual(2);

    messages.close('id-Ben');
    arrive('Cem', 'Psst');
    await messages.news('id-Cem');
    expect(messages.get().chats[0]).toMatchObject({ username: 'Cem', unread: 1 });
    expect(messages.get().unread).toBe(1);
  });

  it('comes in pages: earlier messages are fetched on request, without doubles', async () => {
    const many = Array.from({ length: PAGE + 5 }, (_, i): [boolean, string] => [i % 2 === 0, `m${i}`]);
    const { messages } = await stores({ friends: ['Ben'], lines: { Ben: many } });
    await messages.open('id-Ben');
    let thread = messages.get().threads['id-Ben']!;
    expect(thread.lines).toHaveLength(PAGE);
    expect(thread.more).toBe(true);
    expect(thread.lines[0]!.body).toBe('m5');
    await messages.loadEarlier('id-Ben');
    thread = messages.get().threads['id-Ben']!;
    expect(thread.lines.map((l) => l.body).slice(0, 6)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
    expect(thread.lines).toHaveLength(PAGE + 5);
    expect(thread.more).toBe(false);
  });

  it('blocks and unblocks; the blocked conversation leaves the list', async () => {
    const { messages, calls } = await stores({ friends: ['Ben'], lines: { Ben: [[false, 'Hi']] } });
    await messages.refresh();
    expect(await messages.block('id-Ben')).toBeNull();
    expect(messages.get().chats).toEqual([]);
    expect(messages.get().blocked.map((b) => b.username)).toEqual(['Ben']);
    expect(await messages.unblock('id-Ben')).toBeNull();
    expect(messages.get().blocked).toEqual([]);
    expect(calls).toEqual(expect.arrayContaining(['block:id-Ben', 'unblock:id-Ben']));
  });

  it('reports need a reason, and say why when one is refused', async () => {
    const { messages, reports } = await stores();
    expect(await messages.report('id-Ben', null, '')).toBe('Choose a reason');
    expect(await messages.report('id-Ben', 'spam', 'x'.repeat(501))).toMatch(/under 500/);
    expect(await messages.report('id-Ben', 'harassment', '  rude  ')).toBeNull();
    expect(reports).toEqual([{ who: 'id-Ben', why: 'harassment', note: 'rude' }]);
    for (let i = 0; i < 2; i++) await messages.report('id-Ben', 'spam', '');
    expect(await messages.report('id-Ben', 'spam', '')).toMatch(/a lot of reports/);
    expect(reportProblem('not_found')).toMatch(/does not exist/);
    expect(reportProblem('yourself')).toMatch(/yourself/);
    expect(REPORT_REASONS).toHaveLength(6);
  });

  it('says so when the service cannot be reached', async () => {
    const { messages } = await stores({ down: true });
    await messages.refresh();
    expect(messages.get().status).toBe('failed');
    await messages.open('id-Ben');
    expect(messages.get().threads['id-Ben']!.status).toBe('failed');
    expect((await messages.send('id-Ben', 'hi')).message).toMatch(/did not work/);
    expect(await messages.block('id-Ben')).toMatch(/did not work/);
  });

  it('forgets everything when the player signs out, even an answer still on its way', async () => {
    let answer: (chats: Chat[]) => void = () => undefined;
    const db = fakeDatabase();
    const messages = new Messages({ ...db.backend, conversations: () => new Promise((resolve) => (answer = resolve)) });
    const fetching = messages.refresh();
    messages.clear();
    answer([
      {
        id: 'x',
        publicId: '1',
        username: 'X',
        avatarUrl: null,
        lastBody: 'hi',
        lastAt: at(1),
        lastFromMe: false,
        unread: 3,
      },
    ]);
    await fetching;
    expect(messages.get()).toMatchObject({ status: 'idle', chats: [], unread: 0 });
  });

  it('says when a message was sent, short', () => {
    const now = new Date(2026, 10, 21, 18, 0);
    expect(when(new Date(2026, 10, 21, 9, 5).toISOString(), now)).toBe('09:05');
    expect(when(new Date(2026, 10, 18, 9, 5).toISOString(), now)).toBe('18 Nov');
    expect(when(new Date(2025, 0, 3, 9, 5).toISOString(), now)).toBe('3 Jan 2025');
    expect(when('not a time', now)).toBe('');
    expect(sendProblem('sent')).toBeNull();
  });
});

describe('the messages panel', () => {
  it('lists conversations with unread counts, and friends to write to', async () => {
    await stores({ friends: ['Ben', 'Cem', 'Dea'], lines: { Ben: [[false, 'Hi there']], Cem: [[true, 'See you']] } });
    await render(<MessagesPanel />);
    await waitFor(() => expect(screen.getByTestId('chat-Ben')).toBeOnTheScreen());
    expect(screen.getByRole('button', { name: 'Conversation with Ben, 1 unread' })).toHaveTextContent(/Hi there/);
    expect(screen.getByTestId('chat-Cem')).toHaveTextContent(/You: See you/);
    expect(within(screen.getByTestId('write-to')).getByText('Dea')).toBeOnTheScreen();
  });

  it('says what to do without any friends or messages', async () => {
    await stores();
    await render(<MessagesPanel />);
    await waitFor(() => expect(screen.getByText(/No messages yet\. Add friends/)).toBeOnTheScreen());
  });

  it('opens a conversation, sends a message with Enter or the button, and goes back', async () => {
    const { pokes } = await stores({ friends: ['Ben'], lines: { Ben: [[false, 'Hi Ana']] } });
    await render(<MessagesPanel />);
    await fireEvent.press(await screen.findByTestId('chat-Ben'));
    expect(await screen.findByText('Hi Ana')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Ben' })).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Message to Ben'), 'Hello Ben');
    await fireEvent(screen.getByLabelText('Message to Ben'), 'submitEditing');
    expect(await screen.findByText('Hello Ben')).toBeOnTheScreen();
    expect(screen.getByLabelText('Message to Ben')).toHaveProp('value', '');
    await fireEvent.changeText(screen.getByLabelText('Message to Ben'), 'And again');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('And again')).toBeOnTheScreen();
    expect(screen.getAllByTestId('mine')).toHaveLength(2);
    expect(screen.getAllByTestId('theirs')).toHaveLength(1);
    expect(pokes).toEqual(['id-Ben', 'id-Ben']);

    await fireEvent.press(screen.getByRole('button', { name: 'All messages' }));
    expect(await screen.findByTestId('chat-Ben')).toHaveTextContent(/You: And again/);
  });

  it('opens straight on a friend from the friends panel; a first message starts the conversation', async () => {
    await stores({ friends: ['Dea'] });
    await render(<MessagesPanel start={person('Dea', 'friend')} />);
    expect(await screen.findByText('No messages yet. Say hello!')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Message to Dea'), 'Hello!');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Hello!')).toBeOnTheScreen();
  });

  it('shows why a message was not sent, and that you cannot write to somebody who is not a friend', async () => {
    await stores({ friends: ['Ben'], lines: { Zed: [[false, 'old message']] } });
    const view = await render(<MessagesPanel start={person('Ben', 'friend')} />);
    await fireEvent.changeText(await screen.findByLabelText('Message to Ben'), 'spam spam');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByTestId('message-error')).toHaveTextContent(/very fast/);
    await view.unmount();

    await render(<MessagesPanel start={{ id: 'id-Zed', username: 'Zed', avatarUrl: null, publicId: '1' }} />);
    expect(await screen.findByText('old message')).toBeOnTheScreen();
    expect(screen.getByTestId('not-friends')).toHaveTextContent(/not friends with Zed/);
    expect(screen.queryByLabelText('Message to Zed')).toBeNull();
  });

  it('blocks only after asking, then goes back to the list and says so', async () => {
    const { calls } = await stores({ friends: ['Ben'], lines: { Ben: [[false, 'Hi']] } });
    await render(<MessagesPanel />);
    await fireEvent.press(await screen.findByTestId('chat-Ben'));
    await fireEvent.press(screen.getByRole('button', { name: 'Block Ben' }));
    expect(screen.getByTestId('block-confirm')).toHaveTextContent(/They are not told/);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).not.toContain('block:id-Ben');
    await fireEvent.press(screen.getByRole('button', { name: 'Block Ben' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, block Ben' }));
    expect(await screen.findByTestId('messages-notice')).toHaveTextContent(/You blocked Ben/);
    expect(screen.queryByTestId('chat-Ben')).toBeNull();
    expect(calls).toContain('block:id-Ben');
  });

  it('reports with a reason and a note, blocking too unless that is switched off', async () => {
    const { reports, calls } = await stores({ friends: ['Ben', 'Cem'], lines: { Ben: [[false, 'mean words']] } });
    const view = await render(<MessagesPanel start={person('Ben', 'friend')} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Report Ben' }));
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    // a reason is needed
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(screen.getByTestId('report-error')).toHaveTextContent('Choose a reason');
    await fireEvent.press(screen.getByRole('radio', { name: 'Bullying or harassment' }));
    expect(screen.getByRole('radio', { name: 'Bullying or harassment' })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText('What happened (optional)'), 'He was mean');
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByTestId('report-sent')).toHaveTextContent(/Ben is blocked/);
    expect(reports).toEqual([{ who: 'id-Ben', why: 'harassment', note: 'He was mean' }]);
    expect(calls).toContain('block:id-Ben');
    await fireEvent.press(screen.getByRole('button', { name: 'Back to all messages' }));
    expect(await screen.findByTestId('conversations')).toBeOnTheScreen();
    await view.unmount();

    // without blocking, the conversation goes on
    await render(<MessagesPanel start={person('Cem', 'friend')} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Report Cem' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Spam or scams' }));
    await fireEvent(screen.getByLabelText('Also block Cem'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByTestId('report-sent')).not.toHaveTextContent(/blocked/);
    expect(calls).not.toContain('block:id-Cem');
    await fireEvent.press(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(screen.getByLabelText('Message to Cem')).toBeOnTheScreen();
  });

  it('shows earlier messages on request, and "Seen" under your last message once read', async () => {
    const many = Array.from({ length: PAGE + 2 }, (_, i): [boolean, string] => [false, `m${i}`]);
    const { threads } = await stores({ friends: ['Ben'], lines: { Ben: [...many, [true, 'last from me']] } });
    threads.get('id-Ben')!.at(-1)!.readAt = at(59);
    await render(<MessagesPanel start={person('Ben', 'friend')} />);
    expect(await screen.findByText('last from me')).toBeOnTheScreen();
    expect(screen.getByText(/· Seen/)).toBeOnTheScreen();
    expect(screen.queryByText('m0')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show earlier messages' }));
    expect(await screen.findByText('m0')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show earlier messages' })).toBeNull();
  });

  it('looks for news every 15 seconds while a conversation is open', async () => {
    jest.useFakeTimers();
    try {
      const { arrive } = await stores({ friends: ['Ben'], lines: { Ben: [[true, 'Hi']] } });
      await render(<MessagesPanel start={person('Ben', 'friend')} />);
      await act(async () => jest.advanceTimersByTime(10));
      arrive('Ben', 'Late reply');
      expect(screen.queryByText('Late reply')).toBeNull();
      await act(async () => jest.advanceTimersByTime(15_000));
      expect(screen.getByText('Late reply')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the friends panel and blocking', () => {
  it('offers Message for each friend', async () => {
    await stores({ friends: ['Ben'] });
    const onMessage = jest.fn();
    await render(<FriendsPanel profile={ME} onMessage={onMessage} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Message Ben' }));
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-Ben', username: 'Ben' }));
  });

  it('lists the players you blocked, who can be unblocked', async () => {
    const { messages } = await stores({ friends: ['Ben'] });
    await messages.block('id-Ben');
    await render(<FriendsPanel profile={ME} />);
    const list = await screen.findByTestId('blocked');
    expect(within(list).getByText('Ben')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Unblock Ben' }));
    await waitFor(() => expect(screen.queryByTestId('blocked')).toBeNull());
  });
});
