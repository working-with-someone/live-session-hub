import 'socket.io';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

declare module 'socket.io' {
  interface Socket {
    liveSessionId: string;
    userId: number;
    ffmpegProcess: ChildProcessWithoutNullStreams;
  }
}
