import 'socket.io';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { Role } from '../../../enums/session';
import { LiveSession } from '../../../lib/liveSession/live-session';

declare module 'socket.io' {
  interface Socket {
    liveSession: LiveSession;
    user: Prisma.userGetPayload<{
      include: {
        pfp: true;
      };
    }>;
    role: Role;
    ffmpegProcess: ChildProcessWithoutNullStreams;
  }

  type socketWithLiveSession<T extends LiveSession> = Socket & {
    liveSession: T;
  };
}
