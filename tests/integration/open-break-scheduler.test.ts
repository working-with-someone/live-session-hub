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
import { httpServer } from '../../src/http';
import liveSessionPool from '../../src/lib/liveSession/pool';
import { OrganizerLiveSession } from '../../src/lib/liveSession/live-session';
import { addMinutes } from 'date-fns';
import { live_session_status } from '@prisma/client';

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

  afterAll((done) => {
    httpServer.close(done);
  });

  // live session은
  describe('Schedule Priority Queue', () => {
    beforeEach(() => {});

    afterEach(() => {
      liveSessionPool.clear();
      liveSessionBreakScheduler.clear();
      liveSessionOpenScheduler.clear();
    });

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

      liveSessionPool.add(await OrganizerLiveSession.create(liveSession1.id));
      liveSessionPool.add(await OrganizerLiveSession.create(liveSession2.id));
      liveSessionPool.add(await OrganizerLiveSession.create(liveSession3.id));

      liveSessionOpenScheduler.add(
        liveSession1.id,
        addMinutes(new Date(), liveSession1.break_time!.duration)
      );

      liveSessionOpenScheduler.add(
        liveSession3.id,
        addMinutes(new Date(), liveSession3.break_time!.duration)
      );

      liveSessionOpenScheduler.add(
        liveSession2.id,
        addMinutes(new Date(), liveSession2.break_time!.duration)
      );

      // 다음 open time이 먼저인 순서로 pop되어야한다.
      expect(liveSessionOpenHeap.pop()).toBe(liveSession1.id);
      expect(liveSessionOpenHeap.pop()).toBe(liveSession2.id);
      expect(liveSessionOpenHeap.pop()).toBe(liveSession3.id);
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

      liveSessionPool.add(await OrganizerLiveSession.create(liveSession1.id));
      liveSessionPool.add(await OrganizerLiveSession.create(liveSession2.id));
      liveSessionPool.add(await OrganizerLiveSession.create(liveSession3.id));

      liveSessionBreakScheduler.add(
        liveSession3.id,
        addMinutes(new Date(), liveSession3.break_time!.interval)
      );
      liveSessionBreakScheduler.add(
        liveSession1.id,
        addMinutes(new Date(), liveSession1.break_time!.duration)
      );
      liveSessionBreakScheduler.add(
        liveSession2.id,
        addMinutes(new Date(), liveSession2.break_time!.duration)
      );

      expect(liveSessionBreakHeap.pop()).toBe(liveSession1.id);
      expect(liveSessionBreakHeap.pop()).toBe(liveSession2.id);
      expect(liveSessionBreakHeap.pop()).toBe(liveSession3.id);
    });
  });

  describe('Schedule Task', () => {
    afterEach(() => {
      liveSessionPool.clear();
      liveSessionOpenScheduler.clear();
      liveSessionBreakScheduler.clear();
    });

    test('Live_Session_Open_Must_Be_Called_On_Next_Open_Time', (done) => {
      liveSessionFactory
        .createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          status: live_session_status.BREAKED,
          break_time: {
            create: {
              duration: 0,
              interval: 0,
            },
          },
        })
        .then((liveSession) => {
          const mockOpen = jest.fn().mockImplementation(() => {
            done();
            return new Promise(() => {});
          });
          const organizerLiveSession = new OrganizerLiveSession(liveSession);

          organizerLiveSession.open = mockOpen;

          liveSessionPool.add(organizerLiveSession);
          liveSessionOpenScheduler.add(
            liveSession.id,
            addMinutes(Date.now(), liveSession.break_time!.duration)
          );
        });
    });

    test('Live_Session_Break_Must_Be_Called_On_Next_Break_Time', (done) => {
      liveSessionFactory
        .createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          status: live_session_status.OPENED,
          break_time: {
            create: {
              duration: 0,
              interval: 0,
            },
          },
        })
        .then((liveSession) => {
          const mockBreak = jest.fn().mockImplementation(() => {
            done();
            return new Promise(() => {});
          });

          const organizerLiveSession = new OrganizerLiveSession(liveSession);
          organizerLiveSession.break = mockBreak;

          liveSessionPool.add(organizerLiveSession);
          liveSessionBreakScheduler.add(
            liveSession.id,
            addMinutes(Date.now(), liveSession.break_time!.interval)
          );
        });
    });
  });
});
