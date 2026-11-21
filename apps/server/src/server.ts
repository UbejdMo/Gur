/**
 * The network side: connects players' apps to lobbies over Socket.IO.
 *
 * Every request is answered with "ok" or with the reason it was refused. After any change
 * to a lobby, each of its players is sent their own state; nobody is ever sent another
 * player's rack.
 */
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { Lobbies } from './lobbies';
import type { LobbiesConfig } from './lobbies';
import { LobbyError } from './lobby';
import type { Lobby, SignedInPlayer } from './lobby';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from './protocol';

/** Which lobby and which player a connection speaks for, and whose app it is (signed-in players). */
interface Seat {
  code?: string;
  memberId?: string;
  userId?: string;
  /** When this connection last poked, for the limit on pokes. */
  pokes?: number[];
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, Seat>;

export interface GameServerConfig extends Omit<LobbiesConfig, 'onChange'> {
  /** Web addresses allowed to connect; "*" (the default) allows any. */
  corsOrigin?: string | string[];
  /** How often abandoned lobbies are cleared out. */
  sweepEveryMs?: number;
  /**
   * Checks a player's sign-in token and returns who they are, or null when it is not valid.
   * Without it the server has no accounts: everybody plays as a guest under the name they type.
   */
  verify?: (token: string) => Promise<SignedInPlayer | null>;
  /**
   * Whether the player whose token this is and the player with account id `userId` are
   * friends. Without it nobody can be invited.
   */
  areFriends?: (token: string, userId: string) => Promise<boolean>;
  /** How long an invitation lasts, in milliseconds. */
  inviteMs?: number;
  /** The clock, for invitations (tests set their own). */
  now?: () => number;
}

export interface GameServer {
  http: HttpServer;
  lobbies: Lobbies;
  /** Stops the clocks and closes every connection. */
  close: () => Promise<void>;
}

const room = (memberId: string) => `member:${memberId}`;
/** Every connection of one signed-in player: their open apps, in any tab or on any device. */
const userRoom = (userId: string) => `user:${userId}`;
const ACCOUNT_ID = /^[0-9a-f-]{36}$/i;
export const INVITE_MS = 10_000;
/** At most this many pokes a minute from one connection; more are ignored. */
export const POKES_PER_MINUTE = 30;

export function createGameServer(config: GameServerConfig = {}): GameServer {
  const http = createServer((req, res) => {
    // For the host's health check, and for a person who opens the address in a browser.
    const ok = req.url === '/' || req.url === '/health';
    res.writeHead(ok ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' });
    // It also says whether signed-in players are checked, so that can be seen from any browser.
    res.end(ok ? `Gur game server: ok (${config.verify ? 'accounts on' : 'guests only'})\n` : 'Not found\n');
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, Seat>(http, {
    cors: { origin: config.corsOrigin ?? '*' },
  });

  /** Sends each player of a lobby their own state. */
  const send = (lobby: Lobby) => {
    for (const id of lobby.memberIds()) io.to(room(id)).emit('state', lobby.stateFor(id));
  };
  const lobbies = new Lobbies({ ...config, onChange: send });

  /** Runs a request and answers it; a refusal goes back as words, anything else is a server fault. */
  const answer = <T>(reply: unknown, run: () => T | Promise<T>) => {
    const respond = typeof reply === 'function' ? (reply as (a: Ack<T>) => void) : () => {};
    const refuse = (e: unknown) => {
      if (e instanceof LobbyError) {
        respond({ ok: false, error: e.message });
      } else {
        console.error(e);
        respond({ ok: false, error: 'Something went wrong on the server' });
      }
    };
    try {
      const result = run();
      if (result instanceof Promise) result.then((extra) => respond({ ok: true, ...extra } as Ack<T>), refuse);
      else respond({ ok: true, ...result } as Ack<T>);
    } catch (e) {
      refuse(e);
    }
  };

  /** Who a request comes from, when it carries a sign-in token. Guests carry none. */
  const identify = async (token: unknown): Promise<SignedInPlayer | undefined> => {
    if (token === undefined || token === null || token === '' || !config.verify) return undefined;
    const player = typeof token === 'string' && token.length < 5000 ? await config.verify(token) : null;
    if (!player) throw new LobbyError('Your sign-in has expired. Please sign in again');
    return player;
  };

  const inviteMs = config.inviteMs ?? INVITE_MS;
  const now = config.now ?? Date.now;
  /** Invitations still running: lobby code and invited account -> when they run out. */
  const invites = new Map<string, number>();

  /** The lobby and player this connection speaks for. */
  const seatOf = (socket: GameSocket) => {
    const { code, memberId } = socket.data;
    if (!code || !memberId) throw new LobbyError('You are not in a lobby');
    return { lobby: lobbies.find(code), memberId };
  };

  /** Lets go of the connection's seat. `forGood` is leaving; otherwise the seat is kept for a reconnect. */
  const release = (socket: GameSocket, forGood: boolean) => {
    const { code, memberId } = socket.data;
    socket.data.code = undefined;
    socket.data.memberId = undefined;
    if (!code || !memberId) return;
    void socket.leave(room(memberId));
    let lobby: Lobby;
    try {
      lobby = lobbies.find(code);
    } catch {
      return; // the lobby is already gone
    }
    if (!lobby.has(memberId)) return;
    if (forGood) lobby.leave(memberId);
    // The same player may still be connected from another tab or device.
    else if (!io.sockets.adapter.rooms.get(room(memberId))?.size) lobby.setConnected(memberId, false);
  };

  const sit = (socket: GameSocket, lobby: Lobby, memberId: string) => {
    socket.data.code = lobby.code;
    socket.data.memberId = memberId;
    void socket.join(room(memberId));
    lobby.setConnected(memberId, true);
    socket.emit('state', lobby.stateFor(memberId));
  };

  io.on('connection', (socket: GameSocket) => {
    socket.on('create', (request, reply) =>
      answer(reply, async () => {
        const player = await identify(request?.token);
        release(socket, true);
        const lobby = lobbies.create();
        const memberId = lobby.join(request?.name, player);
        if (request?.settings) lobby.setSettings(memberId, request.settings);
        sit(socket, lobby, memberId);
        return { code: lobby.code, memberId };
      }),
    );

    socket.on('join', (request, reply) =>
      answer(reply, async () => {
        lobbies.find(request?.code);
        const player = await identify(request?.token);
        // Checking the sign-in took a moment: look the lobby up again, it may be gone.
        const lobby = lobbies.find(request?.code);
        // A signed-in player who is already in this lobby takes their own seat again
        // (they opened the game on another device, or lost their key to the lobby).
        const seat = player ? lobby.seatOfAccount(player.userId) : null;
        if (seat !== socket.data.memberId) release(socket, true);
        const memberId = seat ?? lobby.join(request?.name, player);
        sit(socket, lobby, memberId);
        return { code: lobby.code, memberId };
      }),
    );

    socket.on('rejoin', (request, reply) =>
      answer(reply, () => {
        const lobby = lobbies.find(request?.code);
        if (typeof request?.memberId !== 'string' || !lobby.has(request.memberId)) {
          throw new LobbyError('You are no longer in that lobby');
        }
        if (socket.data.memberId !== request.memberId) release(socket, true);
        sit(socket, lobby, request.memberId);
      }),
    );

    socket.on('settings', (request, reply) =>
      answer(reply, () => {
        const { lobby, memberId } = seatOf(socket);
        lobby.setSettings(memberId, request ?? {});
      }),
    );

    socket.on('start', (reply) =>
      answer(reply, () => {
        const { lobby, memberId } = seatOf(socket);
        lobby.start(memberId);
      }),
    );

    socket.on('action', (action, reply) =>
      answer(reply, () => {
        const { lobby, memberId } = seatOf(socket);
        lobby.act(memberId, action);
      }),
    );

    socket.on('next', (reply) =>
      answer(reply, () => {
        const { lobby, memberId } = seatOf(socket);
        lobby.next(memberId);
      }),
    );

    socket.on('leave', (reply) => answer(reply, () => release(socket, true)));

    socket.on('hello', (request, reply) =>
      answer(reply, async () => {
        const player = request?.token ? await identify(request.token) : undefined;
        if (socket.data.userId) void socket.leave(userRoom(socket.data.userId));
        socket.data.userId = player?.userId;
        if (player) void socket.join(userRoom(player.userId));
      }),
    );

    socket.on('poke', (request, reply) =>
      answer(reply, async () => {
        const to = request?.to;
        if (typeof to !== 'string' || !ACCOUNT_ID.test(to)) throw new LobbyError('That player does not exist');
        const player = await identify(request?.token);
        if (!player) throw new LobbyError('Your sign-in has expired. Please sign in again');
        // A poke carries nothing but "look at your conversation with me", and only between friends.
        if (!config.areFriends || !(await config.areFriends(request.token as string, to))) {
          throw new LobbyError('You can only write to your friends');
        }
        const time = now();
        const recent = (socket.data.pokes ?? []).filter((at) => at > time - 60_000);
        if (recent.length >= POKES_PER_MINUTE) return;
        socket.data.pokes = [...recent, time];
        io.to(userRoom(to)).emit('news', { with: player.userId });
        // Your own other tabs and devices show what you sent too.
        socket.to(userRoom(player.userId)).emit('news', { with: to });
      }),
    );

    socket.on('invite', (request, reply) =>
      answer(reply, async () => {
        const userId = request?.userId;
        if (typeof userId !== 'string' || !ACCOUNT_ID.test(userId)) throw new LobbyError('That player does not exist');
        const { lobby, memberId } = seatOf(socket);
        const host = lobby.checkInvite(memberId, userId);
        // The token proves who is asking; the friends list in the database decides who may be asked.
        const player = await identify(request?.token);
        if (!player || player.userId !== host.userId)
          throw new LobbyError('Your sign-in has expired. Please sign in again');
        if (!config.areFriends || !(await config.areFriends(request.token as string, userId))) {
          throw new LobbyError('You can only invite your friends');
        }
        // Checking took a moment: the lobby may have changed meanwhile.
        lobby.checkInvite(memberId, userId);
        const key = `${lobby.code}:${userId}`;
        const time = now();
        for (const [k, until] of invites) if (until <= time) invites.delete(k);
        if ((invites.get(key) ?? 0) > time)
          throw new LobbyError('You invited them already. Wait until the invite runs out');
        if (!io.sockets.adapter.rooms.get(userRoom(userId))?.size) {
          throw new LobbyError('Your friend does not have the game open right now');
        }
        invites.set(key, time + inviteMs);
        const seconds = Math.round(inviteMs / 1000);
        io.to(userRoom(userId)).emit('invited', {
          code: lobby.code,
          from: { name: host.username, avatarUrl: host.avatarUrl },
          seconds,
        });
        return { seconds };
      }),
    );

    socket.on('disconnect', () => release(socket, false));
  });

  const sweeper = setInterval(() => lobbies.sweep(), config.sweepEveryMs ?? 60_000);
  sweeper.unref();

  return {
    http,
    lobbies,
    close: async () => {
      clearInterval(sweeper);
      lobbies.dispose();
      await io.close();
    },
  };
}
