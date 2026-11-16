/**
 * Your friends: the players you are friends with, the requests waiting for your answer, and
 * the ones you sent. One list for the whole app, kept outside the screens. Only for a
 * signed-in player; the database (supabase/migrations) decides what is allowed.
 */

export type Person = {
  id: string;
  /** Eight digits they can be added by. */
  publicId: string;
  username: string;
  avatarUrl: string | null;
  /** 'incoming': they asked you. 'friend': you are friends. 'outgoing': you asked them. */
  state: 'incoming' | 'friend' | 'outgoing';
};

/** What the database answers when you ask somebody to be friends. */
export type AddStatus = 'sent' | 'friends' | 'already' | 'waiting' | 'not_found' | 'yourself' | 'full';

export type FriendsSnapshot = {
  /** 'idle' until the list was asked for; 'failed' when it could not be fetched. */
  status: 'idle' | 'loading' | 'ready' | 'failed';
  people: readonly Person[];
};

/** What the list needs from the service behind it (Supabase). Tests put a stand-in here. Each call may fail. */
export interface FriendsBackend {
  list: () => Promise<Person[]>;
  add: (who: string) => Promise<{ status: AddStatus; username: string | null }>;
  accept: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** What to tell the player after they asked somebody to be friends. */
export function addMessage(status: AddStatus, username: string | null): string {
  const name = username ?? 'That player';
  switch (status) {
    case 'sent':
      return `Request sent to ${name}`;
    case 'friends':
      return `You and ${name} are friends now`;
    case 'already':
      return `You and ${name} are friends already`;
    case 'waiting':
      return `You already asked ${name}. Waiting for their answer`;
    case 'not_found':
      return 'Nobody has that name or ID';
    case 'yourself':
      return 'That is you';
    case 'full':
      return 'You have too many friends or open requests. Remove some first';
  }
}

const EMPTY: FriendsSnapshot = { status: 'idle', people: [] };
const TROUBLE = 'That did not work. Please try again';

export class Friends {
  private snapshot: FriendsSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  /** Counts the fetches, so an answer that comes back late cannot overwrite a newer one. */
  private asked = 0;

  constructor(private readonly backend: FriendsBackend | null) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): FriendsSnapshot => this.snapshot;

  /** Fetches the list again. What is shown stays until the new one is here. */
  async refresh(): Promise<void> {
    if (!this.backend) return;
    const mine = ++this.asked;
    if (this.snapshot.status === 'idle') this.update({ status: 'loading' });
    try {
      const people = await this.backend.list();
      if (mine === this.asked) this.update({ status: 'ready', people });
    } catch {
      if (mine === this.asked) this.update({ status: 'failed' });
    }
  }

  /** Forgets the list: the player signed out. */
  clear(): void {
    this.asked++;
    if (this.snapshot !== EMPTY) {
      this.snapshot = EMPTY;
      this.tell();
    }
  }

  /** Asks a player, by username or ID, to be friends. `ok` says whether something came of it. */
  async add(raw: string): Promise<{ ok: boolean; message: string }> {
    const who = raw.trim();
    if (!this.backend) return { ok: false, message: 'Sign in first' };
    if (!who) return { ok: false, message: 'Type a username or an ID' };
    try {
      const { status, username } = await this.backend.add(who);
      const ok = status === 'sent' || status === 'friends';
      if (ok) await this.refresh();
      return { ok, message: addMessage(status, username) };
    } catch {
      return { ok: false, message: TROUBLE };
    }
  }

  /** Accepts a request. Resolves to what went wrong in words, or null. */
  accept(id: string): Promise<string | null> {
    return this.change((backend) => backend.accept(id));
  }

  /** Ends a friendship, takes a request back, or declines one. Resolves to what went wrong in words, or null. */
  remove(id: string): Promise<string | null> {
    return this.change((backend) => backend.remove(id));
  }

  private async change(act: (backend: FriendsBackend) => Promise<void>): Promise<string | null> {
    if (!this.backend) return 'Sign in first';
    try {
      await act(this.backend);
    } catch {
      return TROUBLE;
    }
    await this.refresh();
    return null;
  }

  private update(change: Partial<FriendsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.tell();
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
