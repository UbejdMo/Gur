import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import { Account, usernameProblem } from '@/account/account';
import type { AuthBackend, Profile, RenameResult } from '@/account/account';
import Friends from '@/app/friends';
import { AccountCard } from '@/components/AccountCard';
import { LobbyRoom } from '@/components/LobbyRoom';
import { PlayerPanel } from '@/components/PlayerPanel';

// The app's one account is swapped for one over a stand-in service, different in each test.
const mockHolder: { account: Account | null } = { account: null };
jest.mock('@/account', () => ({
  get account() {
    return mockHolder.account;
  },
  useAccount: () => {
    const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
    const current = mockHolder.account!;
    return useSyncExternalStore(current.subscribe, current.get, current.get);
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/online/connection', () => ({
  online: {
    savedName: jest.fn(() => 'Typed name'),
    hasSavedSession: jest.fn(() => false),
    create: jest.fn(),
    join: jest.fn(),
  },
}));

const ANA: Profile = {
  id: 'user-1',
  publicId: '48213377',
  username: 'AnaKrasniqi',
  avatarUrl: 'https://example.com/a.png',
};

/** A stand-in for Supabase: a saved sign-in (or none), one profile, and names that are taken. */
function fakeBackend(
  start: { signedIn?: boolean; profile?: Profile | null; taken?: string[]; down?: boolean; keeps?: boolean } = {},
) {
  let signedIn = start.signedIn ?? false;
  let profile = start.profile === undefined ? ANA : start.profile;
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const backend: AuthBackend = {
    session: () => {
      if (start.down) return Promise.reject(new Error('offline'));
      return Promise.resolve(signedIn ? { userId: ANA.id, token: 'token-1' } : null);
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signInWithGoogle: (returnTo) => {
      calls.push(`google:${returnTo}`);
      return Promise.resolve(start.down ? 'Signing in did not work. Please try again' : null);
    },
    signOut: () => {
      signedIn = false;
      calls.push('signOut');
      return Promise.resolve();
    },
    profile: () => Promise.resolve(profile),
    rename: (_id, username): Promise<RenameResult> => {
      calls.push(`rename:${username}`);
      if (start.down) return Promise.reject(new Error('offline'));
      if (start.taken?.includes(username.toLowerCase())) return Promise.resolve({ ok: false, reason: 'taken' });
      if (username === 'Refused') return Promise.resolve({ ok: false, reason: 'invalid' });
      if (username === 'Broken') return Promise.resolve({ ok: false, reason: 'failed' });
      profile = { ...profile!, username };
      return Promise.resolve({ ok: true, profile });
    },
    deleteAccount: () => {
      calls.push('delete');
      if (start.down) return Promise.reject(new Error('offline'));
      if (start.keeps) return Promise.resolve(false);
      signedIn = false;
      profile = null;
      return Promise.resolve(true);
    },
  };
  /** The player comes back from Google signed in: the service says something changed. */
  const arrive = () => {
    signedIn = true;
    listeners.forEach((l) => l());
  };
  return { backend, calls, arrive };
}

/** An account that has finished looking up the saved sign-in. */
async function started(start: Parameters<typeof fakeBackend>[0] = {}) {
  const fake = fakeBackend(start);
  const account = new Account(fake.backend);
  account.start();
  await waitFor(() => expect(account.get().status).not.toBe('starting'));
  return { ...fake, account };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHolder.account = new Account(null);
});

describe('names', () => {
  it('are 3 to 16 letters, digits or underscores, in any alphabet', () => {
    for (const good of ['Ana', 'Ana_K', 'Çelë', 'Player4821', 'a'.repeat(16)]) expect(usernameProblem(good)).toBeNull();
    expect(usernameProblem('ab')).toMatch(/at least 3/);
    expect(usernameProblem('a'.repeat(17))).toMatch(/16 characters/);
    for (const bad of ['has space', 'semi;colon', 'star★']) expect(usernameProblem(bad)).toMatch(/letters, digits/);
  });
});

describe('the account', () => {
  it('is simply absent in a build without accounts: everybody is a guest', async () => {
    const account = new Account(null);
    account.start();
    expect(account.get()).toEqual({ available: false, status: 'signedOut', profile: null });
    expect(await account.token()).toBeNull();
    expect(await account.signIn('https://example.com/')).toMatch(/not set up/);
    expect(await account.rename('Ana')).toMatch(/Sign in first/);
    expect(await account.deleteAccount()).toMatch(/Sign in first/);
    await account.signOut();
    expect(account.get().status).toBe('signedOut');
  });

  it('picks up a saved sign-in, with the profile and the token for the game server', async () => {
    const fake = fakeBackend({ signedIn: true });
    const account = new Account(fake.backend);
    expect(account.get()).toEqual({ available: true, status: 'starting', profile: null });
    expect(await account.token()).toBeNull();
    const seen: string[] = [];
    // the first screen that listens starts the lookup
    account.subscribe(() => seen.push(account.get().status));
    await waitFor(() => expect(account.get()).toEqual({ available: true, status: 'signedIn', profile: ANA }));
    expect(seen).toEqual(['signedIn']);
    expect(await account.token()).toBe('token-1');
  });

  it('is signed out without one, and signed in once the player is back from Google', async () => {
    const { account, calls, arrive } = await started();
    expect(account.get().status).toBe('signedOut');
    expect(await account.signIn('https://example.com/Gur/')).toBeNull();
    expect(calls).toEqual(['google:https://example.com/Gur/']);
    arrive();
    await waitFor(() => expect(account.get().profile).toEqual(ANA));
  });

  it('signs out', async () => {
    const { account, calls } = await started({ signedIn: true });
    await account.signOut();
    expect(calls).toEqual(['signOut']);
    expect(account.get()).toMatchObject({ status: 'signedOut', profile: null });
    expect(await account.token()).toBeNull();
  });

  it('changes the name, and says in words why it cannot', async () => {
    const { account, calls } = await started({ signedIn: true, taken: ['ben'] });
    // caught on the device, without asking
    expect(await account.rename('ab')).toMatch(/at least 3/);
    expect(await account.rename('has space')).toMatch(/letters, digits/);
    expect(await account.rename(' AnaKrasniqi ')).toBeNull();
    expect(calls).toEqual([]);
    // refused by the database
    expect(await account.rename('Ben')).toBe('Somebody already has that name');
    expect(await account.rename('Refused')).toMatch(/letters, digits/);
    expect(await account.rename('Broken')).toMatch(/could not be saved/);
    expect(account.get().profile?.username).toBe('AnaKrasniqi');
    // free
    expect(await account.rename('  Ana_K ')).toBeNull();
    expect(account.get().profile?.username).toBe('Ana_K');
    expect(calls.at(-1)).toBe('rename:Ana_K');
  });

  it('deletes the account for good, and says so when that did not work', async () => {
    const { account, calls } = await started({ signedIn: true });
    expect(await account.deleteAccount()).toBeNull();
    expect(calls).toEqual(['delete']);
    expect(account.get()).toMatchObject({ status: 'signedOut', profile: null });
    expect(await account.token()).toBeNull();
    // there is nothing left to delete
    expect(await account.deleteAccount()).toMatch(/Sign in first/);

    // refused by the service, or the service cannot be reached: the account stays as it is
    const kept = await started({ signedIn: true, keeps: true });
    expect(await kept.account.deleteAccount()).toMatch(/could not be deleted/);
    expect(kept.account.get().status).toBe('signedIn');
    const later = fakeBackend({ signedIn: true });
    const offline = new Account({ ...later.backend, deleteAccount: () => Promise.reject(new Error('offline')) });
    offline.start();
    await waitFor(() => expect(offline.get().status).toBe('signedIn'));
    expect(await offline.deleteAccount()).toMatch(/could not be deleted/);
    expect(offline.get().profile).toEqual(ANA);
  });

  it('falls back to playing as a guest when the service cannot be reached', async () => {
    const down = await started({ signedIn: true, down: true });
    expect(down.account.get()).toMatchObject({ available: true, status: 'signedOut', profile: null });
    expect(await down.account.signIn('https://example.com/')).toMatch(/did not work/);

    // signed in, but no profile row to show: treated as signed out rather than half an account
    const blank = await started({ signedIn: true, profile: null });
    expect(blank.account.get().status).toBe('signedOut');

    // the service goes down after signing in
    const later = fakeBackend({ signedIn: true });
    const account = new Account({
      ...later.backend,
      rename: () => Promise.reject(new Error('offline')),
      signInWithGoogle: () => Promise.reject(new Error('offline')),
    });
    account.start();
    await waitFor(() => expect(account.get().status).toBe('signedIn'));
    expect(await account.rename('Ana_K')).toMatch(/could not be saved/);
    expect(await account.signIn('https://example.com/')).toMatch(/did not work/);
  });
});

describe('the account card on the home screen', () => {
  it('shows nothing in a build without accounts', async () => {
    await render(<AccountCard />);
    expect(screen.queryByTestId('account')).toBeNull();
  });

  it('offers to sign in with Google, and says when that did not work', async () => {
    const fake = await started();
    mockHolder.account = fake.account;
    await render(<AccountCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatch(/^google:/);
    expect(screen.queryByTestId('account-error')).toBeNull();

    const down = await started({ down: true });
    mockHolder.account = down.account;
    await render(<AccountCard />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sign in with Google' }).at(-1)!);
    expect(screen.getByTestId('account-error')).toHaveTextContent(/did not work/);
  });

  it('shows who you are once signed in: name and id; you can change the name and sign out', async () => {
    const fake = await started({ signedIn: true, taken: ['ben'] });
    mockHolder.account = fake.account;
    await render(<AccountCard />);
    expect(screen.getByTestId('account-name')).toHaveTextContent('AnaKrasniqi');
    expect(screen.getByTestId('account-id')).toHaveTextContent('ID 48213377');

    await fireEvent.press(screen.getByRole('button', { name: 'Change name' }));
    expect(screen.getByLabelText('New name')).toHaveProp('value', 'AnaKrasniqi');
    await fireEvent.changeText(screen.getByLabelText('New name'), 'Ben');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByTestId('account-error')).toHaveTextContent('Somebody already has that name');
    expect(screen.getByTestId('account-name')).toHaveTextContent('AnaKrasniqi');

    await fireEvent.changeText(screen.getByLabelText('New name'), 'Ana_K');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByTestId('account-name')).toHaveTextContent('Ana_K');
    expect(screen.queryByLabelText('New name')).toBeNull();
    expect(screen.queryByTestId('account-error')).toBeNull();

    // changing your mind leaves the name alone
    await fireEvent.press(screen.getByRole('button', { name: 'Change name' }));
    await fireEvent.changeText(screen.getByLabelText('New name'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('account-name')).toHaveTextContent('Ana_K');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  });

  it('deletes your account only after asking, and then says it is gone', async () => {
    const fake = await started({ signedIn: true });
    mockHolder.account = fake.account;
    await render(<AccountCard />);

    // changing your mind deletes nothing
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByTestId('delete-warning')).toHaveTextContent(/cannot be undone/);
    await fireEvent.press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(fake.calls).toEqual([]);
    expect(screen.getByTestId('account-name')).toHaveTextContent('AnaKrasniqi');

    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));
    expect(fake.calls).toEqual(['delete']);
    expect(screen.getByTestId('account-deleted')).toHaveTextContent(/Your account is deleted/);
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect(screen.queryByTestId('account-name')).toBeNull();
  });

  it('says so when the account could not be deleted, and keeps it', async () => {
    const fake = await started({ signedIn: true, keeps: true });
    mockHolder.account = fake.account;
    await render(<AccountCard />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete for good' }));
    expect(screen.getByTestId('account-error')).toHaveTextContent(/could not be deleted/);
    expect(screen.getByTestId('account-name')).toHaveTextContent('AnaKrasniqi');
    expect(screen.queryByTestId('account-deleted')).toBeNull();
  });

  it('shows an initial when the account has no picture', async () => {
    const fake = await started({ signedIn: true, profile: { ...ANA, avatarUrl: null } });
    mockHolder.account = fake.account;
    await render(<AccountCard />);
    expect(screen.getByText('A')).toBeTruthy();
  });
});

describe('playing with friends when signed in', () => {
  const online = () =>
    (jest.requireMock('@/online/connection') as { online: { create: jest.Mock; join: jest.Mock } }).online;

  it('you play under the name on your profile: there is no name to type', async () => {
    mockHolder.account = (await started({ signedIn: true })).account;
    online().create.mockResolvedValue({ ok: true, code: 'WRCCS' });
    await render(<Friends />);
    expect(screen.getByTestId('playing-as')).toHaveTextContent('AnaKrasniqi');
    expect(screen.queryByLabelText('Your name')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create a lobby' }));
    expect(online().create).toHaveBeenCalledWith('AnaKrasniqi');
  });

  it('a guest still types a name', async () => {
    mockHolder.account = (await started()).account;
    await render(<Friends />);
    expect(screen.getByLabelText('Your name')).toHaveProp('value', 'Typed name');
    expect(screen.queryByTestId('playing-as')).toBeNull();
  });
});

describe('pictures', () => {
  it('a signed-in player shows their picture in the waiting room and at the table; others a letter', async () => {
    const member = (name: string, avatarUrl: string | null) => ({
      name,
      bot: false,
      connected: true,
      host: name === 'Ana',
      avatarUrl,
      publicId: avatarUrl ? '48213377' : null,
    });
    await render(
      <LobbyRoom
        lobby={{
          code: 'WRCCS',
          you: 0,
          members: [member('Ana', 'https://example.com/a.png'), member('Ben', null)],
          settings: { aceHigh: true, rounds: 1, fillWithBots: false },
          game: null,
          turnEndsAt: null,
          nextRoundAt: null,
          now: Date.now(),
        }}
        onSettings={jest.fn()}
        onStart={jest.fn()}
        onLeave={jest.fn()}
      />,
    );
    expect(screen.getByTestId('picture-0')).toHaveProp('source', { uri: 'https://example.com/a.png' });
    expect(screen.queryByTestId('picture-1')).toBeNull();
    expect(screen.getByText('B')).toBeTruthy();

    const picture = 'https://example.com/c.png';
    await render(<PlayerPanel name="Cem" seat={2} avatarUrl={picture} tileCount={14} points={0} isTurn={false} />);
    expect(screen.getByTestId('picture-2')).toHaveProp('source', { uri: picture });
    // your own badge keeps saying "You"
    await render(<PlayerPanel name="Dea" seat={3} avatarUrl={picture} tileCount={14} points={0} isTurn={false} you />);
    expect(screen.queryByTestId('picture-3')).toBeNull();
    expect(screen.getByText('You')).toBeTruthy();
  });
});
