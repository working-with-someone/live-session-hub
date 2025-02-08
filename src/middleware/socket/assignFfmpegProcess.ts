import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import ffmpegProcessPool from '../../lib/ffmpeg/ffmpegProcessPool';
import { Role } from '../../enums/session';

const assignFfmpegProcessToOrganizer = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  // organizer일 경우에만
  if (socket.liveSession.role === Role.organizer) {
    const process = ffmpegProcessPool.getOrCreateProcess(socket.liveSession.id);

    socket.ffmpegProcess = process;

    socket.on('disconnect', () => {
      ffmpegProcessPool.terminateProcess(socket.liveSession.id);
    });
  }

  next();
};

export default assignFfmpegProcessToOrganizer;
