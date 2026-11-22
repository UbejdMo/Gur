import { useSyncExternalStore } from 'react';
import type { LobbyState } from '@gur/server/protocol';
import type { TableLine } from './connection';

/** The reactions that go with one tap, in the order they are offered. */
export const EMOJIS = ['👍', '👏', '😂', '😮', '😢', '😡', '🔥', '🍀', '🙏', '😎', '🤔', '❤️'] as const;

/** A line that is one of the reactions, shown big. */
export function isEmoji(text: string): boolean {
  return (EMOJIS as readonly string[]).includes(text);
}

/** How long a line stays up over the seat of whoever said it. */
export const BUBBLE_MS = 4_000;

type State = {
  /** The chat ids of the players you muted: their lines are not shown to you. */
  muted: ReadonlySet<string>;
  /** The newest line you have seen, per lobby. */
  seen: Readonly<Record<string, number>>;
};

/**
 * What this device remembers about the chat at a table while the app is open: who you muted,
 * and what you have already read (for the count on the chat button). Nothing is saved.
 */
class TableChatMemory {
  private state: State = { muted: new Set(), seen: {} };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (): State => this.state;

  mute(chatId: string): void {
    this.set({ muted: new Set([...this.state.muted, chatId]) });
  }

  unmute(chatId: string): void {
    this.set({ muted: new Set([...this.state.muted].filter((id) => id !== chatId)) });
  }

  /** Everything up to `id` in that lobby has been seen. */
  seenUpTo(code: string, id: number): void {
    if ((this.state.seen[code] ?? 0) >= id) return;
    this.set({ seen: { ...this.state.seen, [code]: id } });
  }

  private set(change: Partial<State>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }
}

export const tableChatMemory = new TableChatMemory();

export type TableChatView = {
  /** The lines to show, without the muted players'. */
  lines: readonly TableLine[];
  /** Lines from the others you have not seen yet. */
  unread: number;
  muted: ReadonlySet<string>;
  /** For each seat, the latest line said while you were there (it pops up over the seat), or null. */
  speech: readonly ({ id: number; text: string } | null)[];
};

/** The chat at your table as you see it. */
export function useTableChat(lobby: LobbyState, chat: readonly TableLine[]): TableChatView {
  const memory = useSyncExternalStore(tableChatMemory.subscribe, tableChatMemory.get, tableChatMemory.get);
  const mine = lobby.members[lobby.you]?.chatId;
  const lines = chat.filter((line) => !memory.muted.has(line.from));
  const seen = memory.seen[lobby.code] ?? 0;
  const speech = lobby.members.map((_, seat) => {
    const last = lines.filter((l) => l.fresh && l.seat === seat).at(-1);
    return last ? { id: last.id, text: last.text } : null;
  });
  return {
    lines,
    unread: lines.filter((l) => l.id > seen && l.from !== mine).length,
    muted: memory.muted,
    speech,
  };
}
