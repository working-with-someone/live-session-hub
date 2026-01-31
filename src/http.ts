import { createServer } from 'node:http';
import { initSocketIoServer } from './socket.io';

import prismaClient from './database/clients/prisma';
import redisClient from './database/clients/redis';
import { liveSessionExpireScheduler } from './lib/liveSession/schedular/expire-schedular';
import app from './app';
import {
  liveSessionBreakScheduler,
  liveSessionOpenScheduler,
} from './lib/liveSession/schedular/open-break-schedular';

export const httpServer = createServer(app);

export function run() {
  httpServer.listen(process.env.PORT, () => {
    /* eslint-disable-next-line no-console */
    console.log(
      `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
    );

    initSocketIoServer(httpServer);

    liveSessionExpireScheduler.startSchedule();
    liveSessionOpenScheduler.startSchedule();
    liveSessionBreakScheduler.startSchedule();
    prismaClient.$connect();
    redisClient.connect();
  });

  httpServer.on('close', () => {
    liveSessionExpireScheduler.stopSchedule();
    liveSessionBreakScheduler.stopSchedule();
    liveSessionOpenScheduler.stopSchedule();
    prismaClient.$disconnect();
    redisClient.disconnect();
  });
}

export function stop(cb?: (err?: Error) => void) {
  httpServer.close(cb);
}
