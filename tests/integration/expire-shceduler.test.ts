import { liveSessionExpireScheduler } from '../../src/lib/liveSession/schedular/expire-schedular';
import liveSessionFactory from '../factories/live-session-factory';
import { httpServer } from '../../src/http';
import currUser from '../data/curr-user';
import { live_session_status } from '@prisma/client';
import { OrganizerLiveSession } from '../../src/lib/liveSession/live-session';
import liveSessionPool from '../../src/lib/liveSession/pool';

describe('Live Session Monitor', () => {
  beforeAll(async () => {
    await currUser.insert();
  });

  afterAll(async () => {
    await currUser.delete();
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  afterEach(() => {
    liveSessionPool.clear();
    liveSessionExpireScheduler.stopSchedule();
  });

  test('Add_Live_Session', async () => {
    const newLiveSession = new OrganizerLiveSession(
      await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
      })
    );

    liveSessionPool.add(newLiveSession);

    const liveSession = liveSessionPool.get(newLiveSession.id);

    expect(liveSession).toBeDefined();
    expect(liveSession!.id).toBe(newLiveSession.id);
  });

  test('Get_Live_Session', async () => {
    const newLiveSession = new OrganizerLiveSession(
      await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
      })
    );

    await liveSessionPool.add(newLiveSession);

    const liveSession = liveSessionPool.get(newLiveSession.id);

    expect(liveSession).toBeDefined();
    expect(liveSession!.id).toBe(newLiveSession.id);
  });

  test('Clear_Live_Session', async () => {
    const newLiveSession = new OrganizerLiveSession(
      await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
      })
    );

    await liveSessionPool.add(newLiveSession);

    liveSessionPool.clear();

    expect(liveSessionPool.size).toBe(0);
  });

  test('Remove_Live_Session', async () => {
    const newLiveSession = new OrganizerLiveSession(
      await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
      })
    );

    await liveSessionPool.add(newLiveSession);

    liveSessionPool.remove(newLiveSession.id);

    expect(liveSessionPool.has(newLiveSession.id)).toBe(false);
  });

  describe('Live_Session_Monitor_Cron_Task', () => {
    test('Start_Monitoring_Must_Start_Cron_Task', () => {
      liveSessionExpireScheduler.startSchedule();

      expect(liveSessionExpireScheduler.task.getStatus()).toBe('idle');
    });

    test('Stop_Monitoring_Must_Stop_Cron_Task', () => {
      liveSessionExpireScheduler.stopSchedule();

      expect(liveSessionExpireScheduler.task.getStatus()).toBe('stopped');
    });

    test('Monitor_Task_Must_Remove_Expired_Live_Sessions', async () => {
      const newLiveSession = new OrganizerLiveSession(
        await liveSessionFactory.createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          status: live_session_status.OPENED,
        })
      );

      await liveSessionPool.add(newLiveSession);

      liveSessionExpireScheduler.startSchedule();

      // 60분 전이 마지막 활동인 live session
      liveSessionPool.get(newLiveSession.id)!.lastActivity = new Date(
        Date.now() - 1000 * 60 * 60
      );

      await liveSessionExpireScheduler.task.execute();

      expect(liveSessionPool.get(newLiveSession.id)).toBeUndefined();
    });

    test('Monitor_Task_Must_Not_Remove_Active_Live_Sessions', async () => {
      const newLiveSession = new OrganizerLiveSession(
        await liveSessionFactory.createAndSave({
          organizer: {
            connect: {
              id: currUser.id,
            },
          },
          status: live_session_status.READY,
        })
      );

      liveSessionPool.add(newLiveSession);

      liveSessionExpireScheduler.startSchedule();

      await liveSessionPool.get(newLiveSession.id)!.touch();

      await liveSessionExpireScheduler.task.execute();

      expect(liveSessionPool.get(newLiveSession.id)).toBeDefined();
    });
  });
});
