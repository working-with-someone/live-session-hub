import { Event, Namespace, Socket } from 'socket.io';

const registerStreamHandler = (nsp: Namespace, socket: Socket) => {
  const pushData = (fileBuffer: any) => {
    socket.ffmpegProcess.stdin.write(Buffer.from(fileBuffer));
  };

  socket.on('stream:push', pushData);
};

export default registerStreamHandler;
