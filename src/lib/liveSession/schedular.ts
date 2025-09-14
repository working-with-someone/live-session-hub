import cron, { ScheduledTask } from 'node-cron';
import { liveSessionExpireScheduleConfig } from '../../config/schedule-config';
import liveSessionPool from './pool';

class LiveSessionSchedular {
  task: ScheduledTask;

  constructor(task: ScheduledTask) {
    this.task = task;
  }

  startSchedule() {
    if (this.task.getStatus() == 'stopped') {
      this.task.start();
    }
  }

  stopSchedule() {
    if (this.task.getStatus() != 'stopped') {
      this.task.stop();
    }
  }
}

class LiveSessionExpireSchedular extends LiveSessionSchedular {
  constructor() {
    const config = liveSessionExpireScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      const now = new Date();

      liveSessionPool.forEach((liveSession, sessionId) => {
        if (
          now.getTime() - liveSession.lastActivity!.getTime() >
          config.maxInactiveTime
        ) {
          liveSessionPool.remove(liveSession.id);

          liveSession.close().then(() => {});
        }
      });
    });

    super(task);
  }
}

export const liveSessionExpireSchedular = new LiveSessionExpireSchedular();
