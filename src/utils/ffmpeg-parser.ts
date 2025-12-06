export interface FfmpegProgress {
  [key: string]: string | undefined;
  frame?: string;
  fps?: string;
  time?: string;
}

export interface FfmpegOutputCallbacks {
  onError?: (line: string) => void;
  onSuccess?: (line: string) => void;
  onInfo?: (line: string) => void;
  onProgress?: (progress: FfmpegProgress) => void;
}

const nlRegexp = /\r\n|\r|\n/g;

const FLV_WARNING_PATTERNS = [
  /Failed to update header with correct duration/,
  /Failed to update header with correct filesize/,
];

const ERROR_PATTERNS = [
  /Error/,
  /error/,
  /Failed/,
  /failed/,
  /Cannot/,
  /cannot/,
  /Invalid/,
  /invalid/,
  /Permission denied/,
  /No such file/,
  /Connection refused/,
  /Press.*to stop/,
  /Conversion failed/,
];

function isFlvWarningLine(line: string) {
  return FLV_WARNING_PATTERNS.some((pattern) => pattern.test(line));
}

function isErrorLine(line: string) {
  if (isFlvWarningLine(line)) {
    return false; // flv warning은 error로 처리하지 않는다.
  }

  return ERROR_PATTERNS.some((pattern) => pattern.test(line));
}

function isSuccessLine(line: string) {
  const successPatterns = [
    /frame=\s*\d+/,
    /fps=\s*\d+/,
    /bitrate=\s*\d+/,
    /time=\s*\d+:\d+:\d+/,
    /size=\s*\d+/,
    /speed=\s*\d+/,
    /Stream mapping/,
    /Press.*to stop/,
  ];

  return (
    successPatterns.some((pattern) => pattern.test(line)) ||
    parseProgressLine(line) !== null
  );
}

function extractError(stderr: string): string {
  return stderr
    .split(nlRegexp)
    .reduce<string[]>((messages, message) => {
      if (message.charAt(0) === ' ' || message.charAt(0) === '[') {
        return [];
      } else {
        messages.push(message);
        return messages;
      }
    }, [])
    .join('\n');
}

function parseProgressLine(line: string) {
  const progress: FfmpegProgress = {};

  line = line.replace(/=\s+/g, '=').trim();
  const progressParts = line.split(' ');

  // Split every progress part by "=" to get key and value
  for (let i = 0; i < progressParts.length; i++) {
    const progressSplit = progressParts[i].split('=', 2);
    const key = progressSplit[0];
    const value = progressSplit[1];

    // This is not a progress line
    if (typeof value === 'undefined') {
      return null;
    }

    progress[key] = value;
  }

  return progress;
}

export function processFfmpegOutput(
  output: string,
  { onError, onSuccess, onInfo, onProgress }: FfmpegOutputCallbacks
): void {
  const lines = output.split(nlRegexp);

  lines.forEach((line) => {
    if (line.trim()) {
      if (isErrorLine(line)) {
        onError && onError(line);
      } else if (isSuccessLine(line)) {
        onSuccess && onSuccess(line);

        // 진행상황 정보 파싱
        const progress = parseProgressLine(line);
        if (progress && onProgress) {
          onProgress(progress);
        }
      } else {
        onInfo && onInfo(line);
      }
    }
  });
}

const ffmpegParser = {
  processFfmpegOutput,
};

export default ffmpegParser;
