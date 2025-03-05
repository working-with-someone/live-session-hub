import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import { Request } from 'express';
import { wwsError } from '../../error/wwsError';
import httpStatusCode from 'http-status-codes';
import prismaClient from '../../database/clients/prisma';

const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const req = socket.request as Request;

  if (req.session.userId) {
    const user = await prismaClient.user.findFirst({
      where: {
        id: req.session.userId,
      },
      include: {
        pfp: true,
      },
    });

    if (user) {
      socket.user = user;
      return next();
    }
  }

  return next(new wwsError(httpStatusCode.UNAUTHORIZED));
};

export default socketAuthMiddleware;
