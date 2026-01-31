import {
  Namespace,
  Server as SocketIoServer,
  socketWithLiveSession,
} from 'socket.io';
import authMiddleware from './middleware/namespace/auth';
import session from 'express-session';
import sessionConfig from './config/session.config';
import liveSessionMiddleware from './middleware/namespace/session';
import registerStreamHandler from './handler/streamHandler';
import { Server } from 'node:http';
import { Role } from './enums/session';
import chatHandler from './handler/chatHandler';
import registerTransitionHandler from './handler/transitionHandler';
import {
  LiveSession,
  OrganizerLiveSession,
} from './lib/liveSession/live-session';
import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';

// Export 타입 정의
export type { SocketIoServer };
export type { socketWithLiveSession };

// socketIoServer를 전역 변수로 선언
let socketIoServer: SocketIoServer | null = null;
/**
 * Socket.IO 서버를 초기화합니다.
 * @param httpServer HTTP 서버 인스턴스
 * @returns 초기화된 Socket.IO 서버 인스턴스
 */
export function initSocketIoServer(httpServer: Server): SocketIoServer {
  socketIoServer = new SocketIoServer(httpServer, {
    cors: {
      origin: process.env.WWS_CLIENT_APP_ORIGIN,
      credentials: true,
    },
  });

  const liveSessionNsp = socketIoServer.of(
    /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  );

  socketIoServer.engine.use(session(sessionConfig));

  // connection과정에서 한번만 실행된다.
  liveSessionNsp.use((socket: Socket, next: (err?: ExtendedError) => void) => {
    next();
  });
  liveSessionNsp.use(authMiddleware.attachUserOrUnauthorized);
  liveSessionNsp.use(liveSessionMiddleware.attachLiveSessionRoleOrNotFound);
  liveSessionNsp.use(liveSessionMiddleware.attachLiveSession);
  liveSessionNsp.use(liveSessionMiddleware.attachFfmpegProcessToOrganizer);
  liveSessionNsp.use(
    liveSessionMiddleware.registerLiveSessionOnOrganizerConnection
  );

  liveSessionNsp.on(
    'connection',
    (socket: socketWithLiveSession<LiveSession>) => {
      chatHandler(liveSessionNsp, socket);

      // organizer에게만 register되는 handler
      if (socket.role == Role.organizer) {
        registerStreamHandler(
          liveSessionNsp,
          socket as socketWithLiveSession<OrganizerLiveSession>
        );
        registerTransitionHandler(
          liveSessionNsp,
          socket as socketWithLiveSession<OrganizerLiveSession>
        );
      }
    }
  );

  return socketIoServer;
}

export function getSocketIoServer(): SocketIoServer {
  if (!socketIoServer) {
    throw new Error('socket.io server does not initialized');
  }

  return socketIoServer;
}

export function getNameSpace(str: string): Namespace {
  const socketIoServer = getSocketIoServer();

  const namespace = socketIoServer.of(`/${str}`);

  return namespace;
}
