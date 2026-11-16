import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import { Friends, addMessage } from '@/account/friends';
import type { AddStatus, FriendsBackend, Person } from '@/account/friends';
import People from '@/app/people';

// The app's friends list is swapped for one over a stand-in service, different in each test.
const mockHolder: { friends: Friends | null; signedIn: boolean } = { friends: null, signedIn: true };
jest.mock('@/account', () => ({
  get friends() {
    return mockHolder.friends;
  },
  useAccount: () =>
    mockHolder.signedIn
      ? {
          available: true,
          status: 'signedIn',
          profile: { id: 'me', publicId: '48213377', username: 'Ana', avatarUrl: null },
        }
      : { available: true, status: 'signedOut', profile: null },
  useFriends: () => {
    const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
    const current = mockHolder.friends!;
    return useSyncExternalStore(current.subscribe, current.get, current.get);
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const person = (username: string, state: Person['state'], avatarUrl: string | null = null): Person => ({
  id: `id-${username}`,
  publicId: String(10000000 + username.length * 1111),
  username,
  avatarUrl,
  state,
});

/** A stand-in for the database: the list as the player sees it, and other players who can be asked. */
function fakeBackend(start: { people?: Person[]; others?: string[]; down?: boolean } = {}) {
  let people = [...(start.people ?? [])];
  const calls: string[] = [];
  const fail = () => Promise.reject(new Error('offline'));
  const backend: FriendsBackend = {
    list: () => (start.down ? fail() : Promise.resolve([...people])),
    add: (who) => {
      calls.push(`add:${who}`);
      if (start.down) return fail();
      const lower = who.toLowerCase();
      if (lower === 'ana') return Promise.resolve({ status: 'yourself' as AddStatus, username: 'Ana' });
      const known = people.find((p) => p.username.toLowerCase() === lower);
      if (known?.state === 'friend') return Promise.resolve({ status: 'already', username: known.username });
      if (known?.state === 'outgoing') return Promise.resolve({ status: 'waiting', username: known.username });
      if (known?.state === 'incoming') {
        people = people.map((p) => (p === known ? { ...p, state: 'friend' } : p));
        return Promise.resolve({ status: 'friends', username: known.username });
      }
      const other = start.others?.find((name) => name.toLowerCase() === lower);
      if (!other) return Promise.resolve({ status: 'not_found', username: null });
      people = [...people, person(other, 'outgoing')];
      return Promise.resolve({ status: 'sent', username: other });
    },
    accept: (id) => {
      calls.push(`accept:${id}`);
      if (start.down) return fail();
      people = people.map((p) => (p.id === id && p.state === 'incoming' ? { ...p, state: 'friend' } : p));
      return Promise.resolve();
    },
    remove: (id) => {
      calls.push(`remove:${id}`);
      if (start.down) return fail();
      people = people.filter((p) => p.id !== id);
      return Promise.resolve();
    },
  };
  return { backend, calls };
}

const states = (friends: Friends) => friends.get().people.map((p) => `${p.username}:${p.state}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockHolder.signedIn = true;
  mockHolder.friends = new Friends(null);
});

describe('the friends list', () => {
  it('is empty and does nothing without accounts', async () => {
    const friends = new Friends(null);
    await friends.refresh();
    expect(friends.get()).toEqual({ status: 'idle', people: [] });
    expect(await friends.add('Ben')).toEqual({ ok: false, message: 'Sign in first' });
    expect(await friends.accept('x')).toBe('Sign in first');
    expect(await friends.remove('x')).toBe('Sign in first');
  });

  it('fetches your friends and requests, and tells the screens', async () => {
    const { backend } = fakeBackend({ people: [person('Cem', 'incoming'), person('Ben', 'friend')] });
    const friends = new Friends(backend);
    const seen: string[] = [];
    friends.subscribe(() => seen.push(friends.get().status));
    await friends.refresh();
    expect(seen).toEqual(['loading', 'ready']);
    expect(states(friends)).toEqual(['Cem:incoming', 'Ben:friend']);
  });

  it('sends a request and says in words what came of it', async () => {
    const { backend, calls } = fakeBackend({
      people: [person('Ben', 'friend'), person('Cem', 'incoming')],
      others: ['Dea'],
    });
    const friends = new Friends(backend);
    await friends.refresh();
    expect(await friends.add('   ')).toEqual({ ok: false, message: 'Type a username or an ID' });
    expect(calls).toEqual([]);
    expect(await friends.add(' dea ')).toEqual({ ok: true, message: 'Request sent to Dea' });
    expect(calls).toEqual(['add:dea']);
    expect(states(friends)).toContain('Dea:outgoing');
    expect(await friends.add('Dea')).toEqual({ ok: false, message: 'You already asked Dea. Waiting for their answer' });
    expect(await friends.add('Ben')).toEqual({ ok: false, message: 'You and Ben are friends already' });
    // Cem had asked first: asking him makes them friends
    expect(await friends.add('Cem')).toEqual({ ok: true, message: 'You and Cem are friends now' });
    expect(states(friends)).toContain('Cem:friend');
    expect(await friends.add('Nobody')).toEqual({ ok: false, message: 'Nobody has that name or ID' });
    expect(await friends.add('Ana')).toEqual({ ok: false, message: 'That is you' });
    expect(addMessage('full', 'Dea')).toMatch(/too many/);
  });

  it('accepts a request, and removes a friend', async () => {
    const { backend } = fakeBackend({ people: [person('Cem', 'incoming'), person('Ben', 'friend')] });
    const friends = new Friends(backend);
    await friends.refresh();
    expect(await friends.accept('id-Cem')).toBeNull();
    expect(states(friends)).toEqual(['Cem:friend', 'Ben:friend']);
    expect(await friends.remove('id-Ben')).toBeNull();
    expect(states(friends)).toEqual(['Cem:friend']);
  });

  it('says so when the service cannot be reached, and keeps what it had', async () => {
    const down = new Friends(fakeBackend({ down: true }).backend);
    await down.refresh();
    expect(down.get().status).toBe('failed');
    expect((await down.add('Ben')).message).toMatch(/did not work/);
    expect(await down.accept('x')).toMatch(/did not work/);
    expect(await down.remove('x')).toMatch(/did not work/);
  });

  it('forgets everything when the player signs out, even an answer that is still on its way', async () => {
    let answer: (people: Person[]) => void = () => undefined;
    const friends = new Friends({
      ...fakeBackend().backend,
      list: () => new Promise((resolve) => (answer = resolve)),
    });
    const fetching = friends.refresh();
    friends.clear();
    answer([person('Ben', 'friend')]);
    await fetching;
    expect(friends.get()).toEqual({ status: 'idle', people: [] });
  });
});

describe('the Friends screen', () => {
  async function open(start: Parameters<typeof fakeBackend>[0] = {}) {
    const fake = fakeBackend(start);
    mockHolder.friends = new Friends(fake.backend);
    await mockHolder.friends.refresh();
    await render(<People />);
    return fake;
  }

  it('tells a guest to sign in', async () => {
    mockHolder.signedIn = false;
    await render(<People />);
    expect(screen.getByTestId('people-guest')).toHaveTextContent(/Sign in on the first screen/);
    expect(screen.queryByLabelText('Username or ID')).toBeNull();
  });

  it('shows how friends can add you, and says so while you have none', async () => {
    await open();
    expect(screen.getByText(/Friends can add you as/)).toHaveTextContent(
      'Friends can add you as Ana or by your ID 48213377.',
    );
    expect(screen.getByTestId('friends-list')).toHaveTextContent(/Nobody yet/);
    expect(screen.queryByTestId('requests')).toBeNull();
    expect(screen.queryByTestId('sent')).toBeNull();
  });

  it('sends a request by name; it then waits under "Waiting for an answer" and can be taken back', async () => {
    const fake = await open({ others: ['Dea'] });
    await fireEvent.changeText(screen.getByLabelText('Username or ID'), 'dea');
    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByTestId('people-message')).toHaveTextContent('Request sent to Dea');
    expect(screen.getByLabelText('Username or ID')).toHaveProp('value', '');
    expect(within(screen.getByTestId('sent')).getByText('Dea')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Take back the request to Dea' }));
    await waitFor(() => expect(screen.queryByTestId('sent')).toBeNull());
    expect(fake.calls).toEqual(['add:dea', 'remove:id-Dea']);
  });

  it('says why a request was not sent, and keeps what you typed', async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Username or ID'), 'Ghost');
    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByTestId('people-message')).toHaveTextContent('Nobody has that name or ID');
    expect(screen.getByLabelText('Username or ID')).toHaveProp('value', 'Ghost');
  });

  it('lets you accept or decline the requests you got', async () => {
    const fake = await open({ people: [person('Cem', 'incoming'), person('Eli', 'incoming')] });
    expect(within(screen.getByTestId('requests')).getByText('Cem')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept Cem' }));
    await waitFor(() => expect(within(screen.getByTestId('friends-list')).getByText('Cem')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Decline Eli' }));
    await waitFor(() => expect(screen.queryByTestId('requests')).toBeNull());
    expect(screen.queryByText('Eli')).toBeNull();
    expect(fake.calls).toEqual(['accept:id-Cem', 'remove:id-Eli']);
  });

  it('removes a friend only after asking', async () => {
    const fake = await open({ people: [person('Ben', 'friend', 'https://example.com/b.png')] });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Ben' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep Ben' }));
    expect(fake.calls).toEqual([]);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Ben' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, remove Ben' }));
    await waitFor(() => expect(screen.getByTestId('friends-list')).toHaveTextContent(/Nobody yet/));
    expect(fake.calls).toEqual(['remove:id-Ben']);
  });

  it('says so when your friends cannot be fetched or a change does not go through', async () => {
    await open({ down: true });
    expect(screen.getByTestId('friends-list')).toHaveTextContent(/could not be fetched/);
    await fireEvent.changeText(screen.getByLabelText('Username or ID'), 'Ben');
    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByTestId('people-message')).toHaveTextContent(/did not work/);
  });

  it('goes back to the first screen', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
