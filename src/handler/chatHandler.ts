import { Namespace, Socket } from 'socket.io';
import WS_CHANNELS from '../constants/channels';

const chatHandler = (nsp: Namespace, socket: Socket) => {
  const chat = (msg: string) => {
    socket.nsp.emit(WS_CHANNELS.chat.broadCastRecive, {
      msg,
      user: {
        id: socket.user.id,
        username: socket.user.username,
        pfp: socket.user.pfp?.curr,
      },
    });
  };

  socket.on(WS_CHANNELS.chat.broadCastSend, chat);
};

export default chatHandler;
