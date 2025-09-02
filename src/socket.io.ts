import { Server as SocketIoServer, socketWithLiveSession } from 'socket.io';
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

export function attachSocketIoServer(httpServer: Server) {
  const socketIoServer = new SocketIoServer(httpServer, {
    cors: {
      origin: process.env.WWS_CLIENT_APP_ORIGIN,
      credentials: true,
    },
  });

  const liveSessionNsp = socketIoServer.of(
    /^\/livesession\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  );

  socketIoServer.engine.use(session(sessionConfig));

  // connection과정에서 한번만 실행된다.
  liveSessionNsp.use(authMiddleware.attachUserOrUnauthorized);

  liveSessionNsp.use(liveSessionMiddleware.attachLiveSessionRoleOrNotFound);
  liveSessionNsp.use(liveSessionMiddleware.attachLiveSession);
  liveSessionNsp.use(liveSessionMiddleware.attachFfmpegProcessToOrganizer);

  liveSessionNsp.on(
    'connection',
    (socket: socketWithLiveSession<LiveSession>) => {
      chatHandler(liveSessionNsp, socket);

      // organizer에게만 register되는 handler
      if (socket.role == Role.organizer) {
        registerStreamHandler(liveSessionNsp, socket);
        registerTransitionHandler(
          liveSessionNsp,
          socket as socketWithLiveSession<OrganizerLiveSession>
        );
      }
    }
  );
}
