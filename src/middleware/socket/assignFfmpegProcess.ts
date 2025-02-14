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

    process.stdin.on('error', (err) => {
      console.log(err);
    });

    // ffmpeg는 진행 상태, message들을 stderr로 출력한다.
    // spawn과정에서 stdio를 ignore하지 않았기 때문에 정보가 필요하지 않더라도, 이 pipe를 resume해주지 않으면 pipe blocking이 발생한다.
    process.stderr.on('data', (data) => {
      console.log('stderr : ', data.toString());
    });

    process.stdout.on('data', (data) => {
      console.log('stdout ; ', data.toString());
    });

    process.on('error', (err) => {
      console.log(err);
    });

    socket.ffmpegProcess = process;

    socket.on('disconnect', () => {
      ffmpegProcessPool.terminateProcess(socket.liveSession.id);
    });
  }

  next();
};

export default assignFfmpegProcessToOrganizer;
