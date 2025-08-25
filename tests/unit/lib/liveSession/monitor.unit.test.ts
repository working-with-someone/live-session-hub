import liveSessionMonitor from '../../../../src/lib/liveSession/monitor';
import liveSessionFactory from '../../../factories/live-session-factory';

describe('Live Session Monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();

    liveSessionMonitor.clearSessions();
    liveSessionMonitor.stopMonitoring();
  });

  test('Add_Live_Session', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, 1);

    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(true);
  });

  test('Get_Live_Session', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, 1);

    const liveSession = liveSessionMonitor.getSession(newLiveSession.id);

    expect(liveSession).toBeDefined();
    expect(liveSession?.sessionId).toBe(newLiveSession.id);
  });

  test('Remove_Live_Session', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, 1);
    liveSessionMonitor.removeSession(newLiveSession.id);

    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(false);
  });

  test('Touch_Live_Session_Must_Update_Live_Session_Last_Activity', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, 1);

    const initialLastActivity = liveSessionMonitor.sessions.get(
      newLiveSession.id
    )?.lastActivity;

    const after2Minutes = new Date(
      initialLastActivity!.getTime() + 1000 * 60 * 2
    );

    jest.setSystemTime(after2Minutes);

    liveSessionMonitor.touchSession(newLiveSession.id);

    const updatedLastActivity = liveSessionMonitor.sessions.get(
      newLiveSession.id
    )?.lastActivity;

    expect(initialLastActivity).toBeDefined();
    expect(updatedLastActivity?.getTime()).toBeGreaterThan(
      initialLastActivity!.getTime()
    );
  });

  test('Start_Monitoring_Must_Start_Cron_Task', () => {
    liveSessionMonitor.startMonitoring();

    expect(liveSessionMonitor.monitorTask.getStatus() == 'idle');
  });

  test('Stop_Monitoring_Must_Stop_Cron_Task', () => {
    liveSessionMonitor.stopMonitoring();

    expect(liveSessionMonitor.monitorTask.getStatus() == 'stopped');
  });
});
