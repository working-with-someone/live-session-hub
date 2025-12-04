import { liveSessionBreakScheduleConfig } from '../../../config/schedule-config';
import cron from 'node-cron';
import { Heap } from 'heap-js';
import LiveSessionScheduler from './scheduler';
import { addMinutes, differenceInMilliseconds } from 'date-fns';
import {
  LiveSessionSchedule,
  LiveSessionWithAll,
} from '../../../@types/liveSession';

export const liveSessionOpenHeap = new Heap<LiveSessionSchedule>(
  (a: LiveSessionSchedule, b: LiveSessionSchedule) => {
    return differenceInMilliseconds(a.nextOpenTime!, b.nextOpenTime!);
  }
);

export const liveSessionBreakHeap = new Heap<LiveSessionSchedule>(
  (a: LiveSessionSchedule, b: LiveSessionSchedule) => {
    return differenceInMilliseconds(a.nextBreakTime!, b.nextBreakTime!);
  }
);

class LiveSessionOpenScheduler extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionBreakScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      if (!liveSessionOpenHeap.length) {
        return;
      }

      let liveSessionOpenSchedule = liveSessionOpenHeap.peek();

      while (
        liveSessionOpenSchedule &&
        liveSessionOpenSchedule.nextOpenTime! <= new Date()
      ) {
        liveSessionOpenHeap.pop();

        const nextBreakTime = addMinutes(
          liveSessionOpenSchedule.nextOpenTime!,
          liveSessionOpenSchedule.break_time!.interval
        );

        liveSessionOpenSchedule.nextBreakTime = nextBreakTime;

        liveSessionBreakHeap.push(liveSessionOpenSchedule);

        liveSessionOpenSchedule.openCb();

        liveSessionOpenSchedule = liveSessionOpenHeap.peek();
      }
    });

    super(task);
  }

  // 현재로부터 live session의 break time duration뒤에 break되는 schedule을 추가한다.
  add(
    liveSession: LiveSessionWithAll,
    openCb: () => void,
    breakCb: () => void
  ) {
    if (!liveSession.break_time) {
      throw new Error('Live session must have break_time configured');
    }

    const liveSessionSchedule: LiveSessionSchedule = {
      ...liveSession,
      openCb,
      nextOpenTime: addMinutes(new Date(), liveSession.break_time.duration),
      breakCb,
      nextBreakTime: undefined,
    };

    liveSessionOpenHeap.push(liveSessionSchedule);
  }

  clear() {
    liveSessionOpenHeap.clear();
  }
}

class LiveSessionBreakScheduler extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionBreakScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      if (!liveSessionBreakHeap.length) {
        return;
      }

      let liveSessionBreakSchedule = liveSessionBreakHeap.peek();

      while (
        liveSessionBreakSchedule &&
        liveSessionBreakSchedule.nextBreakTime! <= new Date()
      ) {
        liveSessionBreakHeap.pop();

        liveSessionBreakSchedule.nextOpenTime = addMinutes(
          liveSessionBreakSchedule.nextBreakTime!,
          liveSessionBreakSchedule.break_time!.duration
        );

        liveSessionOpenHeap.push(liveSessionBreakSchedule);

        liveSessionBreakSchedule.breakCb();

        liveSessionBreakSchedule = liveSessionBreakHeap.peek();
      }
    });

    super(task);
  }

  // 현재로부터 live session의 break time interval뒤에 break되는 schedule을 추가한다.
  add(
    liveSession: LiveSessionWithAll,
    openCb: () => void,
    breakCb: () => void
  ) {
    if (!liveSession.break_time) {
      throw new Error('Live session must have break_time configured');
    }

    const liveSessionSchedule: LiveSessionSchedule = {
      ...liveSession,
      openCb,
      nextOpenTime: undefined,
      breakCb,
      nextBreakTime: addMinutes(new Date(), liveSession.break_time.interval),
    };

    liveSessionBreakHeap.push(liveSessionSchedule);
  }

  clear() {
    liveSessionBreakHeap.clear();
  }
}

const liveSessionOpenScheduler = new LiveSessionOpenScheduler();
const liveSessionBreakScheduler = new LiveSessionBreakScheduler();

export {
  liveSessionOpenScheduler,
  liveSessionBreakScheduler,
  LiveSessionOpenScheduler,
  LiveSessionBreakScheduler,
};
