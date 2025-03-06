import { Namespace, Socket } from 'socket.io';
import { ResponseCb } from '../@types/augmentation/socket/response';
import WS_CHANNELS from '../constants/channels';
const registerStreamHandler = (nsp: Namespace, socket: Socket) => {
  const pushData = (fileBuffer: any, cb: ResponseCb) => {
    socket.ffmpegProcess.stdin.write(Buffer.from(fileBuffer));

    cb({
      status: 200,
    });
  };

  socket.on(WS_CHANNELS.stream.push, pushData);
};

export default registerStreamHandler;
