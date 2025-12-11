import { createServer } from 'node:http';
import { attachSocketIoServer } from './socket.io';

import prismaClient from './database/clients/prisma';
import redisClient from './database/clients/redis';
import { liveSessionExpireScheduler } from './lib/liveSession/schedular/expire-schedular';

export const httpServer = createServer();

export function run() {
  httpServer.listen(process.env.PORT, () => {
    /* eslint-disable-next-line no-console */
    console.log(
      `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
    );

    attachSocketIoServer(httpServer);

    liveSessionExpireScheduler.startSchedule();
    prismaClient.$connect();
    redisClient.connect();
  });

  httpServer.on('close', () => {
    liveSessionExpireScheduler.stopSchedule();
    prismaClient.$disconnect();
    redisClient.disconnect();
  });
}

export function stop(cb?: (err?: Error) => void) {
  httpServer.close(cb);
}
