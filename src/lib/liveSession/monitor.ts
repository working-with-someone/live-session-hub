import { live_session_status } from '@prisma/client';
import { liveSessionMonitorConfig } from '../../config/minitor.config';
import prismaClient from '../../database/clients/prisma';
import cron, { ScheduledTask } from 'node-cron';

interface LiveSessionMonitorInfo {
  lastActivity: Date;
  sessionId: string;
  organizerId: number;
}

class LiveSessionMonitor {
  sessions: Map<string, LiveSessionMonitorInfo>;
  intervalCronEx: string;
  MaxInActiveTime: number;
  monitorTask: ScheduledTask;

  constructor(intervalCronEx: string, maxInactiveTime: number) {
    this.sessions = new Map();
    this.intervalCronEx = intervalCronEx;
    this.MaxInActiveTime = maxInactiveTime;

    this.monitorTask = cron.createTask(
      liveSessionMonitorConfig.intervalCronEx,
      () => {
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
      }
    );
  }

  // live session을 추가한다.
  addSession(sessionId: string, organizerId: number) {
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

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
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

  startMonitoring() {
    if (this.monitorTask.getStatus() == 'stopped') {
      this.monitorTask.start();
    }
  }

  stopMonitoring() {
    if (this.monitorTask.getStatus() != 'stopped') {
      this.monitorTask.stop();
    }
  }
}

const liveSessionMonitor = new LiveSessionMonitor(
  liveSessionMonitorConfig.intervalCronEx,
  liveSessionMonitorConfig.maxInactiveTime
);

export default liveSessionMonitor;
