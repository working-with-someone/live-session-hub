import { liveSessionBreakScheduleConfig } from '../../../config/schedule-config';
import cron from 'node-cron';
import Queue from 'tinyqueue';
import LiveSessionScheduler from './scheduler';
import { addMinutes } from 'date-fns';
import { LiveSessionSchedule } from '../../../@types/liveSession';

const liveSessionOpenQueue = new Queue<LiveSessionSchedule>();
const liveSessionBreakQueue = new Queue<LiveSessionSchedule>();

class LiveSessionOpenBreakScheduler extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionBreakScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      let liveSessionOpenSchedule = liveSessionOpenQueue.peek();

      // live session의 open schedule시간이되었다면
      while (
        liveSessionOpenSchedule &&
        liveSessionOpenSchedule.nextOpenTime >= new Date()
      ) {
        // live session을 open schedule queue에서 제거한다.
        liveSessionOpenQueue.pop();

        // break tiem interval을 더해 open되어야하는 시간을 구한다.
        // Date.now를 기준으로 next break time을 계산하면 최대 0.9초의 오차가 쌓이는 time drift를 발생할 수 있음.
        const nextBreakTime = addMinutes(
          liveSessionOpenSchedule.nextOpenTime,
          liveSessionOpenSchedule.break_time!.interval
        );

        liveSessionOpenSchedule.nextBreakTime = nextBreakTime;

        // live session이 break될 시간을 enqueue
        liveSessionBreakQueue.push(liveSessionOpenSchedule);

        // open callback 호출
        liveSessionOpenSchedule.openCb();

        // 다음 꺼 가져와잇
        liveSessionOpenSchedule = liveSessionOpenQueue.peek();
      }

      let liveSessionBreakSchedule = liveSessionBreakQueue.peek();

      // live session의 break schedule시간이 되었다면
      while (
        liveSessionBreakSchedule &&
        liveSessionBreakSchedule.nextBreakTime >= new Date()
      ) {
        // live session을 break queue에서 제거한다.
        liveSessionBreakQueue.pop();

        // break time시간을 더해 open되어야하는 시간을 구한다.
        // Date.now를 기준으로 next open time을 계산하면 최대 0.9초의 오차가 쌓이는 time drift를 발생할 수 있음.
        liveSessionBreakSchedule.nextOpenTime = addMinutes(
          liveSessionBreakSchedule.nextBreakTime,
          liveSessionBreakSchedule.break_time!.duration
        );

        // live session이 open될 시간을 enqueue
        liveSessionOpenQueue.push(liveSessionBreakSchedule);

        // break callback 호출
        liveSessionBreakSchedule.breakCb();

        // 다음 꺼 가져와잇
        liveSessionBreakSchedule = liveSessionBreakQueue.peek();
      }
    });

    super(task);
  }
}

const liveSessionOpenBreakSchedular = new LiveSessionOpenBreakScheduler();

export default liveSessionOpenBreakSchedular;
