import { Namespace, Socket } from 'socket.io';
import WS_CHANNELS from '../constants/channels';
import { ResponseCb } from '../@types/augmentation/socket/response';
import { liveSessionStatus } from '../enums/session';
import httpStatusCode from 'http-status-codes';

const chatHandler = (nsp: Namespace, socket: Socket) => {
  const chat = (msg: string, cb: ResponseCb) => {
    // chat is only allowed when the session is breaked
    if (socket.liveSession.status != liveSessionStatus.breaked) {
      return cb({
        status: httpStatusCode.FORBIDDEN,
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
