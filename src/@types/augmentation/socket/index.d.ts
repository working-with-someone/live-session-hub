import 'socket.io';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { liveSession } from '../../liveSession';

declare module 'socket.io' {
  interface Socket {
    liveSession: liveSession;
    userId: number;
    ffmpegProcess: ChildProcessWithoutNullStreams;
  }
}
