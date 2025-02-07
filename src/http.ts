import { createServer } from 'node:http';
import app from './app';
import { attachSocketIoServer } from './socket.io';

import prismaClient from './database/clients/prisma';
import redisClient from './database/clients/redis';

export const httpServer = createServer(app);

export function run() {
  httpServer.listen(process.env.PORT, () => {
    console.log(
      `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
    );

    attachSocketIoServer(httpServer);

    prismaClient.$connect();
    redisClient.connect();
  });

  httpServer.on('close', () => {
    prismaClient.$disconnect();
    redisClient.disconnect();
  });
}

export function stop(cb?: (err?: Error) => void) {
  httpServer.close(cb);
}
