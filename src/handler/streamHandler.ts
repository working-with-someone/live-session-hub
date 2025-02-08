import { Event, Namespace, Socket } from 'socket.io';
import { ResponseCb } from '../@types/augmentation/socket/response';
const registerStreamHandler = (nsp: Namespace, socket: Socket) => {
  const pushData = (fileBuffer: any, cb: ResponseCb) => {
    socket.ffmpegProcess.stdin.write(Buffer.from(fileBuffer));

    cb({
      status: 200,
    });
  };

  socket.on('stream:push', pushData);
};

export default registerStreamHandler;
