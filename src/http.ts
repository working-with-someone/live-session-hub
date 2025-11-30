import { createServer } from 'node:http';
import { attachSocketIoServer } from './socket.io';

import prismaClient from './database/clients/prisma';
import redisClient from './database/clients/redis';
import { liveSessionExpireSchedular } from './lib/liveSession/schedular/expire-schedular';

export const httpServer = createServer();

export function run() {
  httpServer.listen(process.env.PORT, () => {
    console.log(
      `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
    );

    attachSocketIoServer(httpServer);

    liveSessionExpireSchedular.startSchedule();
    prismaClient.$connect();
    redisClient.connect();
  });

  httpServer.on('close', () => {
    liveSessionExpireSchedular.stopSchedule();
    prismaClient.$disconnect();
    redisClient.disconnect();
  });
}

export function stop(cb?: (err?: Error) => void) {
  httpServer.close(cb);
}
