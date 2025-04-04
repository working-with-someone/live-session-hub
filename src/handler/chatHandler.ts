import { Namespace, Socket } from 'socket.io';
import WS_CHANNELS from '../constants/channels';
import { ResponseCb } from '../@types/augmentation/socket/response';
import { live_session_status } from '@prisma/client';
import httpStatusCode from 'http-status-codes';
import prismaClient from '../database/clients/prisma';

const chatHandler = (nsp: Namespace, socket: Socket) => {
  const chat = async (msg: string, cb: ResponseCb) => {
    // chat is only allowed when the session is breaked

    const liveSession = await prismaClient.live_session.findFirst({
      where: {
        id: socket.liveSession.id,
      },
    });

    if (!liveSession) {
      return cb({
        status: httpStatusCode.NOT_FOUND,
        message: 'can not found live session',
      });
    }

    if (liveSession.status != live_session_status.BREAKED) {
      return cb({
        status: httpStatusCode.FORBIDDEN,
        message: 'session is not opened',
      });
    }

    socket.nsp.emit(WS_CHANNELS.chat.broadCastRecive, {
      msg,
      user: {
        id: socket.user.id,
        username: socket.user.username,
        pfp: socket.user.pfp?.curr,
      },
    });

    return cb({
      status: httpStatusCode.OK,
    });
  };

  socket.on(WS_CHANNELS.chat.broadCastSend, chat);
};

export default chatHandler;
