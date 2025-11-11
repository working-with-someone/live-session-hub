import { ExtendedError, Socket } from 'socket.io';
import prismaClient from '../../../database/clients/prisma';
import { wwsError } from '../../../error/wwsError';
import httpStatusCode from 'http-status-codes';
import { Role } from '../../../enums/session';
import ffmpegProcessPool from '../../../lib/ffmpeg/ffmpegProcessPool';
import {
  OrganizerLiveSession,
  ParticipantLiveSession,
} from '../../../lib/liveSession/live-session';
import { live_session_status } from '@prisma/client';

export const attachLiveSessionRoleOrNotFound = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const liveSessionId = socket.nsp.name.split('/').pop();

  const query = socket.handshake.query;

  const liveSessionData = await prismaClient.live_session.findUnique({
    where: {
      id: liveSessionId,
    },
  });

  // 해당 live session이 존재하지 않는다면 not found
  if (!liveSessionData) {
    return next(new wwsError(httpStatusCode.NOT_FOUND));
  }

  if (
    typeof query?.role != 'string' ||
    !Object.values(Role).includes(query.role as Role)
  ) {
    return next(
      new wwsError(httpStatusCode.BAD_REQUEST, 'role does not specified')
    );
  }

  // participant role을 요구한다면 바로 할당한다.
  if (query?.role == Role.participant) {
    socket.role = Role.participant;

    return next();
  }

  // 권한이없다면 401
  if (liveSessionData.organizer_id != socket.user.id) {
    return next(new wwsError(httpStatusCode.UNAUTHORIZED));
  }

  socket.role = Role.organizer;

  return next();
};

export const attachLiveSession = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const liveSessionId = socket.nsp.name.split('/').pop();

  const liveSessionData = await prismaClient.live_session.findUnique({
    where: {
      id: liveSessionId,
    },
  });

  // live session이 closed상태라면, connection을 reject한다.
  if (liveSessionData!.status == live_session_status.CLOSED) {
    next(new wwsError(httpStatusCode.GONE));
  }

  if (socket.role === Role.participant) {
    socket.liveSession = new ParticipantLiveSession(liveSessionData!);
  } else if (socket.role === Role.organizer) {
    socket.liveSession = new OrganizerLiveSession(liveSessionData!);
  }

  return next();
};

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
  attachLiveSessionRoleOrNotFound,
  attachLiveSession,
  attachFfmpegProcessToOrganizer,
};

export default liveSessionMiddleware;
