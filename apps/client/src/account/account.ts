/**
 * Your account: whether you are signed in, and your profile (the name others see, your
 * eight-digit id, your picture). One for the whole app, kept outside the screens.
 *
 * Signing in is optional. Without an account you play as a guest under a name you type.
 */

export type Profile = {
  id: string;
  /** Eight digits a friend can add you by. */
  publicId: string;
  username: string;
  avatarUrl: string | null;
};

export type AccountSnapshot = {
  /** False when this build has no accounts at all: nothing about signing in is shown. */
  available: boolean;
  /** 'starting' until the saved sign-in has been looked up. */
  status: 'starting' | 'signedOut' | 'signedIn';
  profile: Profile | null;
};

export type RenameResult = { ok: true; profile: Profile } | { ok: false; reason: 'taken' | 'invalid' | 'failed' };

/** What the account needs from the service behind it (Supabase). Tests put a stand-in here. */
export interface AuthBackend {
  /** The saved sign-in, if there is one: who, and the token that proves it to the game server. */
  session: () => Promise<{ userId: string; token: string } | null>;
  /** Calls back whenever the player signs in or out, on this tab or another. */
  onChange: (listener: () => void) => () => void;
  /** Sends the player to Google and back to `returnTo`. Resolves to an error in words, or null. */
  signInWithGoogle: (returnTo: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  profile: (userId: string) => Promise<Profile | null>;
  rename: (userId: string, username: string) => Promise<RenameResult>;
  /** Deletes the signed-in player's account for good and forgets the sign-in. False when it did not work. */
  deleteAccount: () => Promise<boolean>;
}

/** The same rule as the database: 3 to 16 letters, digits or underscores. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'A name needs at least 3 characters';
  if (name.length > 16) return 'A name can have 16 characters at most';
  if (/[^\p{L}\p{N}_]/u.test(name)) return 'Use only letters, digits and _ (no spaces)';
  return null;
}

export class Account {
  private snapshot: AccountSnapshot;
  private readonly listeners = new Set<() => void>();
  private started = false;

  constructor(private readonly backend: AuthBackend | null) {
    this.snapshot = { available: backend !== null, status: backend ? 'starting' : 'signedOut', profile: null };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => this.listeners.delete(listener);
  };

  get = (): AccountSnapshot => this.snapshot;

  /** Looks up the saved sign-in and keeps following it. Safe to call more than once. */
  start(): void {
    if (this.started || !this.backend) return;
    this.started = true;
    // The service must not be called back into from inside its own callback, so step out of it first.
    this.backend.onChange(() => setTimeout(() => void this.refresh(), 0));
    void this.refresh();
  }

  /** Goes to Google to sign in. Resolves to an error in words, or null when the browser is on its way. */
  async signIn(returnTo: string): Promise<string | null> {
    if (!this.backend) return 'Signing in is not set up yet';
    try {
      return await this.backend.signInWithGoogle(returnTo);
    } catch {
      return 'Signing in did not work. Please try again';
    }
  }

  async signOut(): Promise<void> {
    await this.backend?.signOut();
    this.update({ status: 'signedOut', profile: null });
  }

  /** Changes your username. Resolves to what is wrong with it in words, or null when it is yours. */
  async rename(raw: string): Promise<string | null> {
    const name = raw.trim();
    const { profile } = this.snapshot;
    if (!this.backend || !profile) return 'Sign in first';
    const problem = usernameProblem(name);
    if (problem) return problem;
    if (name === profile.username) return null;
    let result: RenameResult;
    try {
      result = await this.backend.rename(profile.id, name);
    } catch {
      result = { ok: false, reason: 'failed' };
    }
    if (result.ok) {
      this.update({ profile: result.profile });
      return null;
    }
    if (result.reason === 'taken') return 'Somebody already has that name';
    if (result.reason === 'invalid') return 'Use only letters, digits and _ (no spaces)';
    return 'The name could not be saved. Please try again';
  }

  /**
   * Deletes your account for good: the sign-in, your name, id and picture.
   * Resolves to what went wrong in words, or null when it is gone.
   */
  async deleteAccount(): Promise<string | null> {
    if (!this.backend || !this.snapshot.profile) return 'Sign in first';
    let gone: boolean;
    try {
      gone = await this.backend.deleteAccount();
    } catch {
      gone = false;
    }
    if (!gone) return 'Your account could not be deleted. Please try again';
    this.update({ status: 'signedOut', profile: null });
    return null;
  }

  /** The token that proves to the game server who you are; null for a guest. */
  async token(): Promise<string | null> {
    if (!this.backend || this.snapshot.status !== 'signedIn') return null;
    try {
      return (await this.backend.session())?.token ?? null;
    } catch {
      return null;
    }
  }

  private async refresh(): Promise<void> {
    if (!this.backend) return;
    try {
      const session = await this.backend.session();
      const profile = session ? await this.backend.profile(session.userId) : null;
      this.update(profile ? { status: 'signedIn', profile } : { status: 'signedOut', profile: null });
    } catch {
      // Offline, or the service is down: play as a guest for now.
      this.update({ status: 'signedOut', profile: null });
    }
  }

  private update(change: Partial<AccountSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}
