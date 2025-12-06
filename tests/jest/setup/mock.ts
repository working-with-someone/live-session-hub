import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import prismaClient from '../../../src/database/clients/prisma';

jest.mock('../../../src/middleware/namespace/auth/index.ts', () => {
  return {
    attachUserOrUnauthorized: async (
      socket: Socket,
      next: (err?: ExtendedError) => void
    ) => {
      // socket.request.headers의 key는 lowercase다
      if (!socket.request.headers.userid) {
        throw new Error('userid must specify');
      }

      const user = await prismaClient.user.findFirst({
        where: {
          id: parseInt(socket.request.headers.userid as string),
        },
        include: {
          pfp: true,
        },
      });

      socket.user = user!;

      next();
    },
  };
});
