import { Server as SocketIoServer } from 'socket.io';
import socketAuthMiddleware from './middleware/socket/auth';
import session from 'express-session';
import sessionConfig from './config/session.config';
import { liveSessionPermission } from './middleware/socket/permission';
import registerStreamHandler from './handler/streamHandler';
import assignFfmpegProcessToOrganizer from './middleware/socket/assignFfmpegProcess';
import { Server } from 'node:http';
import { Role } from './enums/session';

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
  liveSessionNsp.use(socketAuthMiddleware);
  liveSessionNsp.use(liveSessionPermission);
  liveSessionNsp.use(assignFfmpegProcessToOrganizer);

  liveSessionNsp.on('connection', (socket) => {
    if (socket.liveSession.role == Role.organizer) {
      registerStreamHandler(liveSessionNsp, socket);
    }
  });
}
