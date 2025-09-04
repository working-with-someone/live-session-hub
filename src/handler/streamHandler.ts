import { Namespace, socketWithLiveSession } from 'socket.io';
import { ResponseCb } from '../@types/augmentation/socket/response';
import WS_CHANNELS from '../constants/channels';
import { live_session_status } from '@prisma/client';
import { OrganizerLiveSession } from '../lib/liveSession/live-session';

const registerStreamHandler = (
  nsp: Namespace,
  socket: socketWithLiveSession<OrganizerLiveSession>
) => {
  const pushData = (fileBuffer: any, cb: ResponseCb) => {
    if (socket.liveSession.status === live_session_status.CLOSED) {
      return cb({
        status: 400,
        message: 'live session is closed',
      });
    }

    socket.ffmpegProcess.stdin.write(Buffer.from(fileBuffer));

    socket.liveSession.touch();

    cb({
      status: 200,
    });
  };

  socket.on(WS_CHANNELS.stream.push, pushData);
};

export default registerStreamHandler;
