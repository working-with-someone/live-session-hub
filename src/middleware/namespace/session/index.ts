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
import ffmpegParser from '../../../utils/ffmpeg-parser';
import WS_CHANNELS from '../../../constants/channels';
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

    process.stderr.on('data', (output) => {
      ffmpegParser.processFfmpegOutput(output.toString(), {
        onError: (line) => {
          socket.emit(WS_CHANNELS.stream.error, line);
        },
        // onProgress, onSuccess는 확실하게 판단할 수 없다고 생각. 아직 사용 x
      });
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
