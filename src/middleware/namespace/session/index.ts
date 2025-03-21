import { ExtendedError, Socket } from 'socket.io';
import prismaClient from '../../../database/clients/prisma';
import { wwsError } from '../../../error/wwsError';
import httpStatusCode from 'http-status-codes';
import { Role } from '../../../enums/session';
import ffmpegProcessPool from '../../../lib/ffmpeg/ffmpegProcessPool';

export const attachLiveSessionOrNotFound = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const liveSessionId = socket.nsp.name.split('/').pop();

  const liveSession = await prismaClient.live_session.findUnique({
    where: {
      id: liveSessionId,
    },
  });

  if (!liveSession) {
    return next(new wwsError(httpStatusCode.NOT_FOUND));
  }

  socket.liveSession = liveSession;

  return next();
}

export const attachRole = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {

  const liveSession = socket.liveSession;

  const role: Role =
    liveSession.organizer_id == socket.user.id
      ? Role.organizer
      : Role.participant;

  socket.role = role;

  return next();
}

const attachFfmpegProcessToOrganizer = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  // organizer일 경우에만
  if (socket.role === Role.organizer) {
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

const liveSessionMiddleware = {
  attachLiveSessionOrNotFound,
  attachRole,
  attachFfmpegProcessToOrganizer
};

export default liveSessionMiddleware