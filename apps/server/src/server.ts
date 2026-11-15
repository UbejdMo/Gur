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
import type { Lobby } from './lobby';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from './protocol';

/** Which lobby and which player a connection speaks for. */
interface Seat {
  code?: string;
  memberId?: string;
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, Seat>;

export interface GameServerConfig extends Omit<LobbiesConfig, 'onChange'> {
  /** Web addresses allowed to connect; "*" (the default) allows any. */
  corsOrigin?: string | string[];
  /** How often abandoned lobbies are cleared out. */
  sweepEveryMs?: number;
}

export interface GameServer {
  http: HttpServer;
  lobbies: Lobbies;
  /** Stops the clocks and closes every connection. */
  close: () => Promise<void>;
}

const room = (memberId: string) => `member:${memberId}`;

export function createGameServer(config: GameServerConfig = {}): GameServer {
  const http = createServer((req, res) => {
    // For the host's health check, and for a person who opens the address in a browser.
    const ok = req.url === '/' || req.url === '/health';
    res.writeHead(ok ? 200 : 404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(ok ? 'Gur game server: ok\n' : 'Not found\n');
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
  const answer = <T>(reply: unknown, run: () => T) => {
    const respond = typeof reply === 'function' ? (reply as (a: Ack<T>) => void) : () => {};
    try {
      const extra = run();
      respond({ ok: true, ...extra } as Ack<T>);
    } catch (e) {
      if (e instanceof LobbyError) {
        respond({ ok: false, error: e.message });
      } else {
        console.error(e);
        respond({ ok: false, error: 'Something went wrong on the server' });
      }
    }
  };

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
      answer(reply, () => {
        release(socket, true);
        const lobby = lobbies.create();
        const memberId = lobby.join(request?.name);
        if (request?.settings) lobby.setSettings(memberId, request.settings);
        sit(socket, lobby, memberId);
        return { code: lobby.code, memberId };
      }),
    );

    socket.on('join', (request, reply) =>
      answer(reply, () => {
        const lobby = lobbies.find(request?.code);
        release(socket, true);
        const memberId = lobby.join(request?.name);
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
