import { live_session_status } from '@prisma/client';
import { liveSessionMonitorConfig } from '../../config/minitor.config';
import prismaClient from '../../database/clients/prisma';
import cron, { ScheduledTask } from 'node-cron';
import { OrganizerLiveSession } from './live-session';

class LiveSessionMonitor {
  sessions: Map<string, OrganizerLiveSession>;
  intervalCronEx: string;
  MaxInActiveTime: number;
  monitorTask: ScheduledTask;

  constructor(intervalCronEx: string, maxInactiveTime: number) {
    this.sessions = new Map();
    this.intervalCronEx = intervalCronEx;
    this.MaxInActiveTime = maxInactiveTime;

    // monitoring되고있는 모든 status의 live session들은 max inactive time을 초과하면 close처리되고 monitoring에서 제외되어야한다.
    this.monitorTask = cron.createTask(
      liveSessionMonitorConfig.intervalCronEx,
      () => {
        const now = new Date();

        this.sessions.forEach((liveSession, sessionId) => {
          if (
            now.getTime() - liveSession.lastActivity!.getTime() >
            this.MaxInActiveTime
          ) {
            this.removeSession(sessionId);

            liveSession.close().then(() => {});
          }
        });
      }
    );
  }

  // live session을 추가한다.
  async addSession(sessionId: string) {
    // 이미 보유하고있다면, 추가하지 않는다.
    if (this.sessions.has(sessionId)) {
      return;
    }

    const data = await prismaClient.live_session.findUnique({
      where: { id: sessionId },
    });

    if (!data) {
      return null;
    }

    const liveSession = new OrganizerLiveSession(data!);

    this.sessions.set(sessionId, liveSession);

    return liveSession;
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
