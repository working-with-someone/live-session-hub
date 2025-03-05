import { ExtendedError, Socket } from 'socket.io';
import prismaClient from '../../database/clients/prisma';
import { wwsError } from '../../error/wwsError';
import httpStatusCode from 'http-status-codes';
import { Role } from '../../enums/session';

export const liveSessionPermission = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const liveSessionId = socket.nsp.name.split('/').pop();

  const liveSession = await prismaClient.live_session.findUnique({
    where: {
      id: liveSessionId,
    },
  });

  if (!liveSession) {
    return next(new wwsError(httpStatusCode.NOT_FOUND));
  }

  const role: Role =
    liveSession.organizer_id == socket.user.id
      ? Role.organizer
      : Role.participant;

  socket.liveSession = liveSession;
  socket.role = role;

  return next();
};
