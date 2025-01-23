import redisClient from './database/clients/redis';
import prismaClient from './database/clients/prisma';
import { httpServer } from './socket.io';

httpServer.listen(process.env.PORT, () => {
  console.log(
    `Live Session Hub Server is listening on port ${process.env.PORT} 🔥`
  );

  prismaClient.$connect();
  redisClient.connect();
});

httpServer.on('close', () => {
  prismaClient.$disconnect();
  redisClient.disconnect();
});

export default httpServer;
