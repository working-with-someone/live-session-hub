import 'socket.io';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { liveSession } from '../../liveSession';
import { Prisma } from '@prisma/client';
import { Role } from '../../../enums/session';

declare module 'socket.io' {
  interface Socket {
    liveSession: Prisma.live_sessionGetPayload<true>;
    user: Prisma.userGetPayload<{
      include: {
        pfp: true;
      };
    }>;
    role: Role;
    ffmpegProcess: ChildProcessWithoutNullStreams;
  }
}
