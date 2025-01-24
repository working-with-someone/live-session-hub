import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import ffmpegProcessPool from '../../lib/ffmpeg/ffmpegProcessPool';

const assignFfmpegProcessToOrganizer = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  // organizer일 경우에만
  if (socket.liveSession.role === 'organizer') {
    const process = ffmpegProcessPool.getOrCreateProcess(socket.liveSession.id);

    socket.ffmpegProcess = process;
  }

  next();
};

export default assignFfmpegProcessToOrganizer;
