import { liveSessionBreakScheduleConfig } from '../../../config/schedule-config';
import cron from 'node-cron';
import { Heap } from 'heap-js';
import LiveSessionScheduler from './scheduler';
import { addMinutes, differenceInMilliseconds } from 'date-fns';

import liveSessionPool from '../pool';

export const liveSessionOpenHeap = new Heap<string>(
  (id1: string, id2: string) => {
    const a = liveSessionPool.get(id1);
    const b = liveSessionPool.get(id2);

    // break time이 설정되어있지 않은 live session은 open break scheduler에 add되지 않는다. 때문에 아래와같이 assertion을 사용한다.
    return differenceInMilliseconds(a!.nextOpenTime!, b!.nextOpenTime!);
  }
);

export const liveSessionBreakHeap = new Heap<string>(
  (id1: string, id2: string) => {
    const a = liveSessionPool.get(id1);
    const b = liveSessionPool.get(id2);

    return differenceInMilliseconds(a!.nextBreakTime!, b!.nextBreakTime!);
  }
);

class LiveSessionOpenScheduler extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionBreakScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      while (liveSessionOpenHeap.length > 0) {
        const peekedId = liveSessionOpenHeap.peek();

        if (!peekedId) break;

        const liveSession = liveSessionPool.get(peekedId);

        if (!liveSession) {
          liveSessionOpenHeap.pop();
          continue;
        }

        if (liveSession.nextOpenTime! > new Date()) {
          break;
        }

        liveSessionOpenHeap.pop();

        liveSession.open().then(() => {
          liveSessionBreakScheduler.add(liveSession.id);
        });
      }
    });

    super(task);
  }

  // 현재로부터 live session의 break time duration뒤에 break되는 schedule을 추가한다.
  add(liveSessionId: string) {
    const liveSession = liveSessionPool.get(liveSessionId);

    if (!liveSession) {
      throw new Error('live session must be exist in live session pool');
    }

    if (!liveSession.break_time) {
      throw new Error('live session does not have break time information');
    }

    const nextOpenTime = addMinutes(
      Date.now(),
      liveSession.break_time.duration
    );

    liveSession.nextOpenTime = nextOpenTime;
    liveSessionOpenHeap.push(liveSessionId);
  }

  clear() {
    liveSessionOpenHeap.clear();
  }
}

class LiveSessionBreakScheduler extends LiveSessionScheduler {
  constructor() {
    const config = liveSessionBreakScheduleConfig;

    const task = cron.createTask(config.intervalCronEx, () => {
      while (liveSessionBreakHeap.length > 0) {
        const liveSessionId = liveSessionBreakHeap.peek();

        if (!liveSessionId) break;

        const liveSession = liveSessionPool.get(liveSessionId);

        if (!liveSession) {
          liveSessionBreakHeap.pop();
          continue;
        }

        // 아직 브레이크 시간이 되지 않았다면 루프 종료
        if (liveSession.nextBreakTime! > new Date()) {
          break;
        }
        liveSessionBreakHeap.pop();

        liveSession.break().then(() => {
          liveSessionOpenScheduler.add(liveSession.id);
        });
      }
    });

    super(task);
  }

  // 현재로부터 live session의 break time interval 뒤에 break되는 schedule을 추가한다.
  add(liveSessionId: string) {
    const liveSession = liveSessionPool.get(liveSessionId);

    if (!liveSession) {
      throw new Error('live session must be exist in live session pool');
    }

    if (!liveSession.break_time) {
      throw new Error('live session does not have break time information');
    }

    const nextBreakTime = addMinutes(
      Date.now(),
      liveSession.break_time.interval
    );

    liveSession.nextBreakTime = nextBreakTime;
    liveSessionBreakHeap.push(liveSessionId);
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
