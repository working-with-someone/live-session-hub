import { live_session_status } from '@prisma/client';
import { liveSessionMonitorConfig } from '../../config/minitor.config';
import prismaClient from '../../database/clients/prisma';

interface LiveSessionMonitorInfo {
  lastActivity: Date;
  sessionId: string;
  organizerId: string;
}

class LiveSessionMonitor {
  sessions: Map<string, LiveSessionMonitorInfo>;
  interval: number;
  MaxInActiveTime: number;
  intervalTimeout: NodeJS.Timeout | null = null;

  constructor(interval: number, maxInactiveTime: number) {
    this.sessions = new Map();
    this.interval = interval || 1000 * 30; // default 30 seconds
    this.MaxInActiveTime = maxInactiveTime || 1000 * 60 * 1; // default 1 minute
  }

  // live session을 추가한다.
  addSession(sessionId: string, organizerId: string) {
    // 이미 보유하고있다면, 추가하지 않는다.
    if (this.sessions.has(sessionId)) {
      return;
    }

    const liveSessionMonitorInfo = {
      lastActivity: new Date(),
      sessionId,
      organizerId,
    };

    this.sessions.set(sessionId, liveSessionMonitorInfo);
  }

  removeSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  clearSessions() {
    this.sessions.clear();
  }

  // live session의 lastActivity를 초기화한다.
  touchSession(sessionId: string) {
    const sessionInfo = this.sessions.get(sessionId);

    if (sessionInfo) {
      sessionInfo.lastActivity = new Date();
    }
  }

  // live session을 monitoring한다.
  // interval마다 maxInactiveTime을 초과한 live session을 close상태로 update하고 monitoring 목록에서 제거한다.
  startMonitoring() {
    this.intervalTimeout = setInterval(() => {
      const now = new Date();

      this.sessions.forEach((info, sessionId) => {
        if (
          now.getTime() - info.lastActivity.getTime() >
          this.MaxInActiveTime
        ) {
          // live session의 status를 close로 update한다.
          prismaClient.live_session.update({
            where: { id: sessionId },
            data: { status: live_session_status.CLOSED },
          });

          this.removeSession(sessionId);
        }
      });
    }, this.interval);
  }
  // monitoring을 종료한다.
  stopMonitoring() {
    if (this.intervalTimeout) {
      clearInterval(this.intervalTimeout);
      this.intervalTimeout = null;
    }
  }
}

const liveSessionMonitor = new LiveSessionMonitor(
  liveSessionMonitorConfig.interval,
  liveSessionMonitorConfig.maxInactiveTime
);

export default liveSessionMonitor;
