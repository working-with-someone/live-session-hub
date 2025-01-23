import { Server } from 'socket.io';
import { createServer } from 'node:http';
import app from './app';
import socketAuthMiddleware from './middleware/socket/auth';
import session from 'express-session';
import sessionConfig from './config/session.config';
import { liveSessionPermission } from './middleware/socket/permission';
import registerStreamHandler from './handler/streamHandler';
export const httpServer = createServer(app);

export const socketIoServer = new Server(httpServer, {
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

liveSessionNsp.on('connection', (socket) => {
  console.log(socket.liveSession);
  registerStreamHandler(liveSessionNsp, socket);
});
