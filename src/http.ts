import { createServer } from 'node:http';
import { attachSocketIoServer } from './socket.io';

import prismaClient from './database/clients/prisma';
import redisClient from './database/clients/redis';
import liveSessionMonitor from './lib/liveSession/monitor';

export const httpServer = createServer();

export function run() {
  httpServer.listen(process.env.PORT, () => {
    console.log(
      `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
    );

    attachSocketIoServer(httpServer);

    liveSessionMonitor.startMonitoring();
    prismaClient.$connect();
    redisClient.connect();
  });

  httpServer.on('close', () => {
    liveSessionMonitor.stopMonitoring();
    prismaClient.$disconnect();
    redisClient.disconnect();
  });
}

export function stop(cb?: (err?: Error) => void) {
  httpServer.close(cb);
}
