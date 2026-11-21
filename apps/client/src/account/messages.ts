/**
 * Messages between friends, the players you blocked, and reporting. One store for the whole
 * app, kept outside the screens. Only for a signed-in player; the database
 * (supabase/migrations/0004_messages.sql) decides what is allowed.
 *
 * Messages are kept in the database. When you send one, the game server is asked to nudge
 * the friend's open apps ("poke"), which then fetch it; a slower check every half minute
 * catches anything a nudge missed.
 */

/** One message in a conversation. */
export type Line = {
  id: number;
  fromMe: boolean;
  body: string;
  /** When it was sent (ISO time). */
  at: string;
  /** When the other player read it (ISO time), or null. */
  readAt: string | null;
};

/** One conversation in the list: who, the last message, and how many of theirs are unread. */
export type Chat = {
  id: string;
  publicId: string;
  username: string;
  avatarUrl: string | null;
  lastBody: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
};

export type Blocked = { id: string; publicId: string; username: string; avatarUrl: string | null };

export type SendStatus = 'sent' | 'empty' | 'too_long' | 'not_friends' | 'too_fast';
export type ReportReason = 'harassment' | 'hate' | 'spam' | 'name_or_picture' | 'cheating' | 'other';
export type ReportStatus = 'sent' | 'invalid' | 'not_found' | 'yourself' | 'too_many';

export const MAX_MESSAGE = 500;
export const MAX_NOTE = 500;
/** How many messages are fetched at a time. */
export const PAGE = 50;

/** The reasons a player can give when reporting, in the order they are offered. */
export const REPORT_REASONS: readonly { reason: ReportReason; label: string }[] = [
  { reason: 'harassment', label: 'Bullying or harassment' },
  { reason: 'hate', label: 'Hate or threats' },
  { reason: 'spam', label: 'Spam or scams' },
  { reason: 'name_or_picture', label: 'Offensive name or picture' },
  { reason: 'cheating', label: 'Cheating' },
  { reason: 'other', label: 'Something else' },
];

/** What the store needs from the service behind it (Supabase). Tests put a stand-in here. Each call may fail. */
export interface MessagesBackend {
  conversations: () => Promise<Chat[]>;
  /** Newest first, at most PAGE, all older than `beforeId` when given. */
  thread: (other: string, beforeId: number | null) => Promise<Line[]>;
  send: (to: string, body: string) => Promise<{ status: SendStatus; line: Line | null }>;
  markRead: (other: string) => Promise<void>;
  block: (who: string) => Promise<void>;
  unblock: (who: string) => Promise<void>;
  blocks: () => Promise<Blocked[]>;
  report: (who: string, why: ReportReason, note: string) => Promise<ReportStatus>;
}

export type Thread = {
  /** Oldest first. */
  lines: readonly Line[];
  status: 'loading' | 'ready' | 'failed';
  /** Whether there are older messages to fetch. */
  more: boolean;
};

export type MessagesSnapshot = {
  /** The list of conversations: 'idle' until asked for, 'failed' when it could not be fetched. */
  status: 'idle' | 'loading' | 'ready' | 'failed';
  chats: readonly Chat[];
  /** All unread messages together, for the badge on the messages button. */
  unread: number;
  threads: Readonly<Record<string, Thread>>;
  blocked: readonly Blocked[];
};

const EMPTY: MessagesSnapshot = { status: 'idle', chats: [], unread: 0, threads: {}, blocked: [] };
const TROUBLE = 'That did not work. Please try again';

export function sendProblem(status: SendStatus): string | null {
  switch (status) {
    case 'sent':
      return null;
    case 'empty':
      return 'Type a message first';
    case 'too_long':
      return `A message can be at most ${MAX_MESSAGE} characters`;
    case 'not_friends':
      return 'You can only write to your friends';
    case 'too_fast':
      return 'You are writing very fast. Wait a moment, then send it again';
  }
}

export function reportProblem(status: ReportStatus): string | null {
  switch (status) {
    case 'sent':
      return null;
    case 'invalid':
      return 'Choose a reason, and keep the note under 500 characters';
    case 'not_found':
      return 'That player does not exist any more';
    case 'yourself':
      return 'You cannot report yourself';
    case 'too_many':
      return 'You have sent a lot of reports today. Try again tomorrow, or write to us';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a message was sent, short: "14:05" today, "18 Nov" this year, "18 Nov 2025" before. */
export function when(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  if (at.toDateString() === now.toDateString()) {
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  }
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear() ? day : `${day} ${at.getFullYear()}`;
}

/** Puts lines together without doubles, oldest first. */
function merge(a: readonly Line[], b: readonly Line[]): Line[] {
  const byId = new Map<number, Line>();
  for (const line of [...a, ...b]) byId.set(line.id, line);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

export class Messages {
  private snapshot: MessagesSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  /** Counts the list fetches, so an answer that comes back late cannot overwrite a newer one. */
  private asked = 0;
  /** The conversation on screen: news from that player is read at once. */
  private onScreen: string | null = null;
  /** Tells the game server to nudge a friend (set by the app once the connection exists). */
  private poke: (to: string) => void = () => undefined;

  constructor(private readonly backend: MessagesBackend | null) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): MessagesSnapshot => this.snapshot;

  /** How to nudge a friend through the game server. */
  setPoke(poke: (to: string) => void): void {
    this.poke = poke;
  }

  /** Fetches the list of conversations again. What is shown stays until the new one is here. */
  async refresh(): Promise<void> {
    if (!this.backend) return;
    const mine = ++this.asked;
    if (this.snapshot.status === 'idle') this.update({ status: 'loading' });
    try {
      const chats = await this.backend.conversations();
      if (mine !== this.asked) return;
      // The conversation on screen counts as read, whatever the database says this instant.
      const shown = chats.map((c) => (c.id === this.onScreen ? { ...c, unread: 0 } : c));
      this.update({ status: 'ready', chats: shown, unread: shown.reduce((n, c) => n + c.unread, 0) });
    } catch {
      if (mine === this.asked) this.update({ status: 'failed' });
    }
  }

  /** Forgets everything: the player signed out. */
  clear(): void {
    this.asked++;
    this.onScreen = null;
    if (this.snapshot !== EMPTY) {
      this.snapshot = EMPTY;
      this.tell();
    }
  }

  /** Shows the conversation with a player: fetches the latest messages and marks theirs read. */
  async open(other: string): Promise<void> {
    if (!this.backend) return;
    this.onScreen = other;
    const known = this.snapshot.threads[other];
    if (!known) this.setThread(other, { lines: [], status: 'loading', more: false });
    await this.fetchLatest(other);
    await this.read(other);
  }

  /** The conversation is no longer on screen. */
  close(other: string): void {
    if (this.onScreen === other) this.onScreen = null;
  }

  /** Fetches the page of messages before the oldest one shown. */
  async loadEarlier(other: string): Promise<void> {
    const thread = this.snapshot.threads[other];
    if (!this.backend || !thread?.lines.length) return;
    try {
      const older = await this.backend.thread(other, thread.lines[0]!.id);
      const now = this.snapshot.threads[other] ?? thread;
      this.setThread(other, { ...now, lines: merge(older, now.lines), more: older.length >= PAGE });
    } catch {
      // The button stays; the player can try again.
    }
  }

  /** Something new in the conversation with a player, says the game server. */
  async news(other: string): Promise<void> {
    if (!this.backend) return;
    if (this.snapshot.threads[other]) await this.fetchLatest(other);
    if (this.onScreen === other) await this.read(other);
    else await this.refresh();
  }

  /** Sends a message. `ok` says whether it went; otherwise `message` says why not. */
  async send(to: string, raw: string): Promise<{ ok: boolean; message: string | null }> {
    if (!this.backend) return { ok: false, message: 'Sign in first' };
    const body = raw.trim();
    if (!body) return { ok: false, message: sendProblem('empty') };
    if (body.length > MAX_MESSAGE) return { ok: false, message: sendProblem('too_long') };
    let answer: { status: SendStatus; line: Line | null };
    try {
      answer = await this.backend.send(to, body);
    } catch {
      return { ok: false, message: TROUBLE };
    }
    if (answer.status !== 'sent' || !answer.line) return { ok: false, message: sendProblem(answer.status) ?? TROUBLE };
    const thread = this.snapshot.threads[to] ?? { lines: [], status: 'ready' as const, more: false };
    this.setThread(to, { ...thread, lines: merge(thread.lines, [answer.line]) });
    this.poke(to);
    void this.refresh();
    return { ok: true, message: null };
  }

  /** Fetches the players you blocked. */
  async loadBlocked(): Promise<void> {
    if (!this.backend) return;
    try {
      this.update({ blocked: await this.backend.blocks() });
    } catch {
      // Shown as it was.
    }
  }

  /** Blocks a player. Resolves to what went wrong in words, or null. */
  async block(who: string): Promise<string | null> {
    if (!this.backend) return 'Sign in first';
    try {
      await this.backend.block(who);
    } catch {
      return TROUBLE;
    }
    const chats = this.snapshot.chats.filter((c) => c.id !== who);
    this.update({ chats, unread: chats.reduce((n, c) => n + c.unread, 0) });
    await this.loadBlocked();
    return null;
  }

  /** Unblocks a player. Resolves to what went wrong in words, or null. */
  async unblock(who: string): Promise<string | null> {
    if (!this.backend) return 'Sign in first';
    try {
      await this.backend.unblock(who);
    } catch {
      return TROUBLE;
    }
    this.update({ blocked: this.snapshot.blocked.filter((b) => b.id !== who) });
    void this.refresh();
    return null;
  }

  /** Reports a player. Resolves to what went wrong in words, or null. */
  async report(who: string, why: ReportReason | null, note: string): Promise<string | null> {
    if (!this.backend) return 'Sign in first';
    if (!why) return 'Choose a reason';
    if (note.trim().length > MAX_NOTE) return reportProblem('invalid');
    try {
      return reportProblem(await this.backend.report(who, why, note.trim()));
    } catch {
      return TROUBLE;
    }
  }

  private async fetchLatest(other: string): Promise<void> {
    if (!this.backend) return;
    try {
      const latest = await this.backend.thread(other, null);
      const now = this.snapshot.threads[other];
      const lines = merge(now?.lines ?? [], latest);
      // Read receipts and the like change: the latest page wins for the lines it has.
      this.setThread(other, {
        lines,
        status: 'ready',
        more: now && now.status === 'ready' ? now.more : latest.length >= PAGE,
      });
    } catch {
      const now = this.snapshot.threads[other];
      if (!now || now.status === 'loading') this.setThread(other, { lines: [], status: 'failed', more: false });
    }
  }

  private async read(other: string): Promise<void> {
    if (!this.backend) return;
    const chat = this.snapshot.chats.find((c) => c.id === other);
    if (chat && chat.unread > 0) {
      const chats = this.snapshot.chats.map((c) => (c.id === other ? { ...c, unread: 0 } : c));
      this.update({ chats, unread: chats.reduce((n, c) => n + c.unread, 0) });
    }
    try {
      await this.backend.markRead(other);
    } catch {
      // It stays unread in the database; the next look tries again.
    }
    await this.refresh();
  }

  private setThread(other: string, thread: Thread): void {
    this.update({ threads: { ...this.snapshot.threads, [other]: thread } });
  }

  private update(change: Partial<MessagesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.tell();
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
