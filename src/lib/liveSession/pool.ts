import { liveSessionMonitorConfig } from '../../config/session.config';
import { $Enums, Prisma } from '@prisma/client';
import ffmpegProcessPool from '../ffmpeg/ffmpegProcessPool';
import { ChildProcessWithoutNullStreams } from 'node:child_process';

export class LiveSessionPool extends Map<string, LiveSession> {
  addOrGetLiveSession(data: Prisma.live_sessionGetPayload<true>) {
    const liveSession = new LiveSession(data);

    if (this.has(liveSession.id)) {
      throw new Error(`Live session with id ${liveSession.id} already exists.`);
    }

    this.set(liveSession.id, liveSession);
  }

  removeLiveSession(liveSessionId: string) {
    this.delete(liveSessionId);
  }
}

class LiveSession implements Prisma.live_sessionGetPayload<true> {
  id: string;
  title: string;
  description: string | null;
  thumbnail_uri: string;
  category: string;
  status: $Enums.live_session_status;
  stream_key: string;
  access_level: $Enums.access_level;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  organizer_id: number;

  ffmpegProcess: ChildProcessWithoutNullStreams;

  constructor(liveSession: Prisma.live_sessionGetPayload<true>) {
    this.id = liveSession.id;
    this.title = liveSession.title;
    this.description = liveSession.description;
    this.thumbnail_uri = liveSession.thumbnail_uri;
    this.category = liveSession.category;
    this.status = liveSession.status;
    this.stream_key = liveSession.stream_key;
    this.access_level = liveSession.access_level;
    this.created_at = liveSession.created_at;
    this.updated_at = liveSession.updated_at;
    this.started_at = liveSession.started_at;
    this.organizer_id = liveSession.organizer_id;

    this.ffmpegProcess = ffmpegProcessPool.getOrCreateProcess(this.id);
  }

  pushRTMP(fileBuffer: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ffmpegProcess.stdin.write(Buffer.from(fileBuffer), (err) => {
        if (err) {
          return reject();
        }

        resolve();
      });
    });
  }

  // ffempgProcess가 정상적이어야하며, last activity가 timeoutThreshold 이내여야 한다.
  isHealthy(): boolean {
    // ffmpeg process가 정상적으로 실행되는 중이라면, ffmpegProcess.exitCode는 null이다.
    return this.ffmpegProcess.exitCode === null;
  }
}

const liveSessionPool = new LiveSessionPool();

export default liveSessionPool;
