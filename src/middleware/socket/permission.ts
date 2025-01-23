import { ExtendedError, Socket } from 'socket.io';
import prismaClient from '../../database/clients/prisma';
import { wwsError } from '../../error/wwsError';
import httpStatusCode from 'http-status-codes';

export const liveSessionPermission = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const liveSessionId = socket.nsp.name.split('/').pop();

  const liveSession = await prismaClient.session.findUnique({
    where: {
      id: liveSessionId,
    },
    include: {
      session_live: true,
    },
  });

  if (!liveSession) {
    return next(new wwsError(httpStatusCode.NOT_FOUND));
  }

  socket.liveSessionId = liveSession.id;

  return next();
};
