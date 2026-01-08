// expire-scheduler.ts
import { liveSessionExpireScheduleConfig } from '../../../config/schedule-config';
import cron from 'node-cron';
import LiveSessionScheduler from './scheduler';
import liveSessionPool from '../pool';

class LiveSessionExpireSchedular extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionExpireScheduleConfig;

    const task = cron.schedule(config.intervalCronEx, async () => {
      await this.executeTask();
    });

    super(task);
  }

  async executeTask(): Promise<void> {
    const config = liveSessionExpireScheduleConfig;
    const now = new Date();

    for (const liveSession of liveSessionPool.values()) {
      if (
        now.getTime() - liveSession.lastActivity!.getTime() >
        config.maxInactiveTime
      ) {
        await liveSession.close();
      }
    }
  }
}

export const liveSessionExpireScheduler = new LiveSessionExpireSchedular();
