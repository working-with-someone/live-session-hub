import { addMinutes } from 'date-fns';
import liveSessionFactory from '../factories/live-session-factory';
import {
  liveSessionOpenScheduler,
  liveSessionBreakScheduler,
} from '../../src/lib/liveSession/schedular/open-break-schedular';
import {
  liveSessionOpenHeap,
  liveSessionBreakHeap,
} from '../../src/lib/liveSession/schedular/open-break-schedular';
import currUser from '../data/curr-user';
import { Socket as ClientSocket } from 'socket.io-client';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import { access_level, live_session_status } from '@prisma/client';

describe('Open Break Scheduler', () => {
  beforeAll(async () => {
    await currUser.insert();
    liveSessionOpenScheduler.startSchedule();
    liveSessionBreakScheduler.startSchedule();
  });

  afterAll(async () => {
    liveSessionOpenScheduler.stopSchedule();
    liveSessionBreakScheduler.stopSchedule();
    await currUser.delete();
    await liveSessionFactory.cleanup();
  });

  afterEach(async () => {
    liveSessionOpenScheduler.clear();
    liveSessionBreakScheduler.clear();

    await liveSessionFactory.cleanup();
  });

  // live session은
  describe('Schedule Priority Queue', () => {
    test('Should_Be_Popped_In_Order_Of_Next_Open_Time', async () => {
      const liveSession1 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 10,
            interval: 30,
          },
        },
      });

      const liveSession2 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 20,
            interval: 50,
          },
        },
      });

      const liveSession3 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 30,
            interval: 60,
          },
        },
      });

      const openCb = jest.fn();
      const closeCb = jest.fn();

      liveSessionOpenScheduler.add(liveSession1, openCb, closeCb);
      liveSessionOpenScheduler.add(liveSession3, openCb, closeCb);
      liveSessionOpenScheduler.add(liveSession2, openCb, closeCb);

      // 다음 open time이 먼저인 순서로 pop되어야한다.
      expect(liveSessionOpenHeap.pop()?.id).toBe(liveSession1.id);
      expect(liveSessionOpenHeap.pop()?.id).toBe(liveSession2.id);
      expect(liveSessionOpenHeap.pop()?.id).toBe(liveSession3.id);
    });

    test('Should_Be_Popped_In_Order_Of_Next_Break_Time', async () => {
      // 테스트를 위해 현재 시간 기준으로 다른 break 시간을 가지는 세션 생성
      const liveSession1 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 10,
            interval: 30,
          },
        },
      });

      const liveSession2 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 20,
            interval: 50,
          },
        },
      });

      const liveSession3 = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        break_time: {
          create: {
            duration: 30,
            interval: 60,
          },
        },
      });

      const openCb = jest.fn();
      const breakCb = jest.fn();

      liveSessionBreakScheduler.add(liveSession3, openCb, breakCb);
      liveSessionBreakScheduler.add(liveSession1, openCb, breakCb);
      liveSessionBreakScheduler.add(liveSession2, openCb, breakCb);

      expect(liveSessionBreakHeap.pop()?.id).toBe(liveSession1.id);
      expect(liveSessionBreakHeap.pop()?.id).toBe(liveSession2.id);
      expect(liveSessionBreakHeap.pop()?.id).toBe(liveSession3.id);
    });
  });

  describe('Schedule Task', () => {
    test('Should_Call_Open_Callback_On_Next_Open_Time', (done) => {
      // open callback이 call되어야하며, open heap에서 pop되고 break heap에 push되어야한다.
      const openCb = () => {
        expect(liveSessionOpenHeap).toHaveLength(0);
        expect(liveSessionBreakHeap).toHaveLength(1);
        done();
      };

      // break callback은 call되어선 안된다.
      const breakCb = () => {
        done(new Error('break callback must not be called on open schedule'));
      };

      liveSessionFactory
        .createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          break_time: {
            create: {
              duration: 0, // 1분 뒤에 open (테스트를 짧게)
              interval: 0,
            },
          },
        })
        .then((liveSession) => {
          liveSessionOpenScheduler.add(liveSession, openCb, breakCb);
        });
    });

    test('Should_Call_Break_Callback_On_Next_Break_Time', (done) => {
      // open callback은 call되어선 안된다.
      const openCb = () => {
        done(new Error('open callback must not be called on break schedule'));
      };

      // break callback이 call되어야하며, break heap에서 pop되고 open heap에 push되어야한다.
      const breakCb = () => {
        expect(liveSessionBreakHeap).toHaveLength(0);
        expect(liveSessionOpenHeap).toHaveLength(1);
        done();
      };

      liveSessionFactory
        .createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          break_time: {
            create: {
              duration: 0, // 1분 뒤에 open (테스트를 짧게)
              interval: 0,
            },
          },
        })
        .then((liveSession) => {
          liveSessionBreakScheduler.add(liveSession, openCb, breakCb);
        });
    });
  });
});
