import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import { Request } from 'express';
import { wwsError } from '../../error/wwsError';
import httpStatusCode from 'http-status-codes';

const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const req = socket.request as Request;

  if (req.session.userId) {
    socket.userId = req.session.userId;
    return next();
  }

  return next(new wwsError(httpStatusCode.UNAUTHORIZED));
};

export default socketAuthMiddleware;
