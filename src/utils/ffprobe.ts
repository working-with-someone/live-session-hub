import { execFile } from 'child_process';

export type FFProbeResult = {
  streams: any[];
  format: any;
};

const ffprobeCmd = 'ffprobe';

export function probe(
  filePath: string,
  timeout = 10000
): Promise<FFProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      new URL(filePath, process.env.RTMP_STATIC_ORIGIN).href,
    ];

    const child = execFile(ffprobeCmd, args, { timeout }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const parsed = JSON.parse(stdout);

        resolve({ streams: parsed.streams || [], format: parsed.format || {} });
      } catch (e) {
        reject(e);
      }
    });

    child.on('error', (err) => reject(err));
  });
}
