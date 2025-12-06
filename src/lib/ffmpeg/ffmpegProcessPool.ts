import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

class FFmpegProcessPool {
  pool: Map<string, ChildProcessWithoutNullStreams>;

  constructor() {
    this.pool = new Map();
  }

  private createProcess(liveSessionId: string) {
    const rtmpEndpoint = new URL(
      `live/${liveSessionId}`,
      process.env.RTMP_SERVER_ORIGIN
    ).toString();

    return spawn('ffmpeg', [
      '-y',
      // input, output file의 format을 강제한다. 지정하지 않으면 auto detection한다.
      '-f',
      'webm',
      // 0 : stdin, 1 : stdout, 2 : stderr 를 의미한다.
      '-i',
      'pipe:0',
      // video codec을 libx264로 지정한다.
      '-c:v',
      'libx264',
      // audio code을 aac로 지정한다.
      '-c:a',
      'aac',
      // 압축 속도를 조절한다. 압축속도가 높을수록 압축률은 줄어든다.
      '-preset',
      'medium',
      '-f',
      'flv',
      rtmpEndpoint,
    ]);
  }

  getOrCreateProcess(liveSessionId: string) {
    let process = this.pool.get(liveSessionId);

    // get
    if (process) {
      return process;
    }

    // create
    process = this.createProcess(liveSessionId);

    // process가 종료되면 pool에서 제거한다.
    process.on('exit', () => {
      this.pool.delete(liveSessionId);
    });

    this.pool.set(liveSessionId, process);

    return process;
  }

  terminateProcess(liveSessionId: string) {
    const process = this.pool.get(liveSessionId);

    if (!process) {
      return;
    }

    process.stdin.end();
    process.kill();
  }

  terminateAllProcess() {
    for (const liveSessionId of this.pool.keys()) {
      this.terminateProcess(liveSessionId);
    }
  }
}

const ffmpegProcessPool = new FFmpegProcessPool();

export default ffmpegProcessPool;
