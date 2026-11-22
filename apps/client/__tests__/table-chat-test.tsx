import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { Ack, LobbyState } from '@gur/server/protocol';
import { SpeechBubble } from '@/components/SpeechBubble';
import { TableChat } from '@/components/TableChat';
import type { TableLine } from '@/online/connection';
import { BUBBLE_MS, EMOJIS, isEmoji, tableChatMemory } from '@/online/tableChat';

jest.mock('@/account', () => ({ useAccount: jest.fn(() => ({ profile: null })) }));
const useAccount = (jest.requireMock('@/account') as { useAccount: jest.Mock }).useAccount;

beforeEach(() => useAccount.mockReturnValue({ profile: null }));

/** Ana (you), Ben and Cem in a lobby, and a bot. Each test uses its own code and chat ids: the device's memory is shared. */
function lobby(code: string, signedIn = false): LobbyState {
  const member = (name: string, i: number) => ({
    name,
    bot: name === 'Bot',
    connected: true,
    host: i === 0,
    avatarUrl: null,
    publicId: signedIn && name !== 'Bot' ? `1000000${i}` : null,
    chatId: `${code}-${name}`,
  });
  return {
    code,
    you: 0,
    members: ['Ana', 'Ben', 'Cem', 'Bot'].map(member),
    settings: { aceHigh: true, rounds: 1, fillWithBots: true },
    game: null,
    turnEndsAt: null,
    nextRoundAt: null,
    now: Date.now(),
  };
}

const line = (code: string, id: number, who: string, seat: number, text: string, fresh = true): TableLine => ({
  id,
  from: `${code}-${who}`,
  seat,
  name: who,
  text,
  at: id,
  fresh,
});

function setup(code: string, chat: TableLine[], { signedIn = false, say = { ok: true } as Ack } = {}) {
  const onSay = jest.fn(async (_text: string): Promise<Ack> => say);
  const onReport = jest.fn(async (): Promise<Ack> => ({ ok: true }));
  const room = lobby(code, signedIn);
  return { onSay, onReport, room, ui: <TableChat lobby={room} chat={chat} onSay={onSay} onReport={onReport} /> };
}

describe('the chat at a table', () => {
  it('knows its one-tap emojis', () => {
    expect(EMOJIS).toHaveLength(12);
    expect(isEmoji('🔥')).toBe(true);
    expect(isEmoji('fire')).toBe(false);
  });

  it('a tap on an emoji sends it at once; anything else is typed and sent', async () => {
    const { onSay, ui } = setup('EMOJI', []);
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByText('Nothing said yet. Say hello, or send an emoji.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send 😂' }));
    expect(onSay).toHaveBeenLastCalledWith('😂');

    await fireEvent.changeText(screen.getByLabelText('Message to the table'), 'Good luck all');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onSay).toHaveBeenLastCalledWith('Good luck all');
    // sent: the box is empty again
    expect(screen.getByLabelText('Message to the table').props.value).toBe('');
    // Enter sends too
    await fireEvent.changeText(screen.getByLabelText('Message to the table'), 'gg');
    await fireEvent(screen.getByLabelText('Message to the table'), 'submitEditing');
    expect(onSay).toHaveBeenLastCalledWith('gg');
  });

  it("shows the server's reason when a line is refused, and keeps what was typed", async () => {
    const { ui } = setup('SLOWS', [], { say: { ok: false, error: 'Slow down a little' } });
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Chat' }));
    await fireEvent.changeText(screen.getByLabelText('Message to the table'), 'again');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByTestId('chat-error')).toHaveTextContent('Slow down a little');
    expect(screen.getByLabelText('Message to the table').props.value).toBe('again');
  });

  it('counts what the others said that you have not seen, until you open the chat', async () => {
    const code = 'UNRED';
    const chat = [line(code, 1, 'Ana', 0, 'hi'), line(code, 2, 'Ben', 1, 'hello'), line(code, 3, 'Cem', 2, '👍')];
    const { ui } = setup(code, chat);
    await render(ui);
    // your own line is not news to you
    expect(screen.getByRole('button', { name: 'Chat, 2 unread' })).toBeTruthy();
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('2');
    await fireEvent.press(screen.getByRole('button', { name: 'Chat, 2 unread' }));
    const lines = within(screen.getByTestId('chat-lines'));
    expect(lines.getByTestId('chat-mine')).toHaveTextContent('Youhi');
    expect(lines.getAllByTestId('chat-theirs')).toHaveLength(2);
    expect(screen.queryByTestId('chat-unread')).toBeNull();
  });

  it('mutes a player for you: their lines go, and come back when unmuted. Bots are not listed', async () => {
    const code = 'MUTES';
    const chat = [line(code, 1, 'Ben', 1, 'you are slow'), line(code, 2, 'Cem', 2, 'be nice')];
    const { ui } = setup(code, chat);
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Chat, 2 unread' }));
    const players = within(screen.getByTestId('chat-players'));
    expect(players.queryByText('Bot')).toBeNull();
    expect(players.queryByText('Ana')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Mute Ben' }));
    expect(screen.queryByText('you are slow')).toBeNull();
    expect(screen.getByText('be nice')).toBeTruthy();
    // guests can mute, not report
    expect(screen.queryByRole('button', { name: /^Report/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Unmute Ben' }));
    expect(screen.getByText('you are slow')).toBeTruthy();
  });

  it('a signed-in player reports another who signed in: a reason is needed, then they are muted', async () => {
    useAccount.mockReturnValue({ profile: { username: 'Ana' } });
    const code = 'REPRT';
    const { ui, onReport } = setup(code, [line(code, 1, 'Ben', 1, 'loser')], { signedIn: true });
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Chat, 1 unread' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Report Ben' }));
    const form = within(screen.getByTestId('chat-report'));
    expect(form.getByText(/what Ben said at this table/)).toBeTruthy();
    await fireEvent.press(form.getByRole('button', { name: 'Send report' }));
    expect(form.getByTestId('chat-report-error')).toHaveTextContent('Choose a reason');
    expect(onReport).not.toHaveBeenCalled();

    await fireEvent.press(form.getByRole('radio', { name: 'Bullying or harassment' }));
    await fireEvent.changeText(form.getByLabelText('What happened (optional)'), '  keeps insulting  ');
    await fireEvent.press(form.getByRole('button', { name: 'Send report' }));
    expect(onReport).toHaveBeenCalledWith(`${code}-Ben`, 'harassment', 'keeps insulting', true);
    expect(screen.getByTestId('chat-notice')).toHaveTextContent(
      'Thank you. Your report about Ben was sent, and they are muted for you. They are blocked too.',
    );
    expect(screen.queryByText('loser')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unmute Ben' })).toBeTruthy();
    expect(tableChatMemory.get().muted.has(`${code}-Ben`)).toBe(true);
  });

  it("does not offer to report a guest, and passes on the server's refusal", async () => {
    useAccount.mockReturnValue({ profile: { username: 'Ana' } });
    const code = 'GUEST';
    const onReport = jest.fn(async (): Promise<Ack> => ({ ok: false, error: 'Reporting is not available right now' }));
    const room = lobby(code, true);
    room.members[2] = { ...room.members[2]!, publicId: null };
    await render(<TableChat lobby={room} chat={[]} onSay={jest.fn()} onReport={onReport} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.queryByRole('button', { name: 'Report Cem' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Report Ben' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Spam or scams' }));
    await fireEvent(screen.getByRole('switch'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(onReport).toHaveBeenCalledWith(`${code}-Ben`, 'spam', '', false);
    expect(screen.getByTestId('chat-report-error')).toHaveTextContent('Reporting is not available right now');
    // nothing was sent, so nobody was muted
    expect(screen.getByRole('button', { name: 'Mute Ben' })).toBeTruthy();
  });
});

describe('the speech bubble', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows what was just said for a few seconds', async () => {
    await render(<SpeechBubble text="🔥" />);
    expect(screen.getByTestId('speech')).toHaveTextContent('🔥');
    await act(() => jest.advanceTimersByTime(BUBBLE_MS - 100));
    expect(screen.getByTestId('speech')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByTestId('speech')).toBeNull();
  });
});
