import { liveSessionExpireScheduleConfig } from '../../../config/schedule-config';
import cron from 'node-cron';
import LiveSessionScheduler from './scheduler';
import liveSessionPool from '../pool';

class LiveSessionExpireSchedular extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionExpireScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      const now = new Date();

      liveSessionPool.forEach((liveSession) => {
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

export const liveSessionExpireScheduler = new LiveSessionExpireSchedular();
