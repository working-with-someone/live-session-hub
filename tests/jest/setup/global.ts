import prismaClient from '../../../src/database/clients/prisma';
import testUserData from '../../data/user.json';
import { httpServer } from '../../../src/socket.io';
import redisClient from '../../../src/database/clients/redis';

export default async function globalSetup() {
  httpServer.listen(process.env.PORT, () => {
    redisClient.connect();
    prismaClient.$connect();
  });

  httpServer.on('close', () => {
    redisClient.disconnect();
    prismaClient.$disconnect();
  });
}
