import { live_session_status } from '@prisma/client';
import { liveSessionMonitorConfig } from '../../config/minitor.config';
import prismaClient from '../../database/clients/prisma';
import cron, { ScheduledTask } from 'node-cron';
import { OrganizerLiveSession } from './live-session';
import liveSessionPool from './pool';

class LiveSessionMonitor {
  intervalCronEx: string;
  MaxInActiveTime: number;
  monitorTask: ScheduledTask;

  constructor(intervalCronEx: string, maxInactiveTime: number) {
    this.intervalCronEx = intervalCronEx;
    this.MaxInActiveTime = maxInactiveTime;

    // monitoring되고있는 모든 status의 live session들은 max inactive time을 초과하면 close처리되고 monitoring에서 제외되어야한다.
    this.monitorTask = cron.createTask(
      liveSessionMonitorConfig.intervalCronEx,
      () => {
        const now = new Date();

        liveSessionPool.forEach((liveSession, sessionId) => {
          if (
            now.getTime() - liveSession.lastActivity!.getTime() >
            this.MaxInActiveTime
          ) {
            liveSessionPool.remove(liveSession.id);

            liveSession.close().then(() => {});
          }
        });
      }
    );
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
