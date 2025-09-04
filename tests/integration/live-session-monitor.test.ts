import liveSessionMonitor from '../../src/lib/liveSession/monitor';
import liveSessionFactory from '../factories/live-session-factory';
import { httpServer } from '../../src/http';
import currUser from '../data/curr-user';
import { live_session_status } from '@prisma/client';

describe('Live Session Monitor', () => {
  beforeAll(async () => {
    await currUser.insert();
  });

  afterAll(async () => {
    await currUser.delete();
    httpServer.close();
  });

  afterEach(() => {
    liveSessionMonitor.clearSessions();
    liveSessionMonitor.stopMonitoring();
  });

  test('Add_Live_Session', async () => {
    const newLiveSession = await liveSessionFactory.createAndSave({
      organizer: {
        connect: {
          id: currUser.id,
        },
      },
    });

    await liveSessionMonitor.addSession(newLiveSession.id);

    const liveSession = liveSessionMonitor.getSession(newLiveSession.id);

    expect(liveSession).toBeDefined();
    expect(liveSession!.id).toBe(newLiveSession.id);
  });

  test('Get_Live_Session', async () => {
    const newLiveSession = await liveSessionFactory.createAndSave({
      organizer: {
        connect: {
          id: currUser.id,
        },
      },
    });

    await liveSessionMonitor.addSession(newLiveSession.id);

    const liveSession = liveSessionMonitor.getSession(newLiveSession.id);

    expect(liveSession).toBeDefined();
    expect(liveSession!.id).toBe(newLiveSession.id);
  });

  test('Clear_Live_Session', async () => {
    const newLiveSession = await liveSessionFactory.createAndSave({
      organizer: {
        connect: {
          id: currUser.id,
        },
      },
    });
    await liveSessionMonitor.addSession(newLiveSession.id);
    liveSessionMonitor.clearSessions();

    expect(liveSessionMonitor.sessions.size).toBe(0);
  });

  test('Remove_Live_Session', async () => {
    const newLiveSession = await liveSessionFactory.createAndSave({
      organizer: {
        connect: {
          id: currUser.id,
        },
      },
    });

    await liveSessionMonitor.addSession(newLiveSession.id);
    liveSessionMonitor.removeSession(newLiveSession.id);

    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(false);
  });

  describe('Live_Session_Monitor_Cron_Task', () => {
    test('Start_Monitoring_Must_Start_Cron_Task', () => {
      liveSessionMonitor.startMonitoring();

      expect(liveSessionMonitor.monitorTask.getStatus()).toBe('idle');
    });

    test('Stop_Monitoring_Must_Stop_Cron_Task', () => {
      liveSessionMonitor.stopMonitoring();

      expect(liveSessionMonitor.monitorTask.getStatus()).toBe('stopped');
    });

    test('Monitor_Task_Must_Remove_Expired_Live_Sessions', async () => {
      const newLiveSession = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        status: live_session_status.OPENED,
      });

      liveSessionMonitor.startMonitoring();

      await liveSessionMonitor.addSession(newLiveSession.id);

      // 60분 전이 마지막 활동인 live session
      liveSessionMonitor.sessions.get(newLiveSession.id)!.lastActivity =
        new Date(Date.now() - 1000 * 60 * 60);

      await liveSessionMonitor.monitorTask.execute();

      expect(liveSessionMonitor.getSession(newLiveSession.id)).toBeUndefined();
    });

    test('Monitor_Task_Must_Not_Remove_Active_Live_Sessions', async () => {
      const newLiveSession = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        status: live_session_status.READY,
      });

      liveSessionMonitor.startMonitoring();

      await liveSessionMonitor.addSession(newLiveSession.id);
      await liveSessionMonitor.getSession(newLiveSession.id)!.touch();

      await liveSessionMonitor.monitorTask.execute();

      expect(liveSessionMonitor.getSession(newLiveSession.id)).toBeDefined();
    });
  });
});
