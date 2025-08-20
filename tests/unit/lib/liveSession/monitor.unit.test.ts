import { live_session_status } from '@prisma/client';
import liveSessionMonitor from '../../../../src/lib/liveSession/monitor';
import liveSessionFactory from '../../../factories/live-session-factory';
import { prismaMock } from '../../../jest/setup/singleton';

describe('Live Session Monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();

    liveSessionMonitor.clearSessions();
    liveSessionMonitor.stopMonitoring(); // 모니터링 중지 추가
  });

  test('Add_Live_Session', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, '1');

    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(true);
  });

  test('Remove_Live_Session', () => {
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, '1');
    liveSessionMonitor.removeSession(newLiveSession.id);

    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(false);
  });

  test('Touch_Live_Session_Must_Update_Live_Session_Last_Activity', () => {
    const originalDate = Date;
    const newLiveSession = liveSessionFactory.create();

    liveSessionMonitor.addSession(newLiveSession.id, '1');

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

  // live session monitor는 live session의 last activity가 maxInactiveTime을 초과하면, 상태를 close로 업데이트하고 제거한다.
  test('Monitoring_Should_Update_Live_Session_Status_To_CLOSED_And_Remove_Live_Session_If_Inactive', () => {
    const newLiveSession = liveSessionFactory.create(); // Create a new live session
    liveSessionMonitor.addSession(newLiveSession.id, '1'); // Add the session to the monitor
    liveSessionMonitor.startMonitoring();

    const after3Minutes = new Date(Date.now() + 1000 * 60 * 3);

    jest.setSystemTime(after3Minutes);

    // start monitoring의 setInterval을 한번 실행한다.
    jest.runOnlyPendingTimers();

    expect(prismaMock.live_session.update).toHaveBeenCalledWith({
      where: { id: newLiveSession.id },
      data: { status: live_session_status.CLOSED },
    });
    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(false);
  });

  test('Monitoring_Should_Not_Update_Live_Session_Status_If_Active', () => {
    const newLiveSession = liveSessionFactory.create();
    liveSessionMonitor.addSession(newLiveSession.id, '1');
    liveSessionMonitor.startMonitoring();

    const after3Minutes = new Date(Date.now() + 1000 * 60 * 3);

    jest.setSystemTime(after3Minutes);

    liveSessionMonitor.touchSession(newLiveSession.id);

    // Run the monitoring interval
    jest.runOnlyPendingTimers();

    expect(prismaMock.live_session.update).not.toHaveBeenCalled();
    expect(liveSessionMonitor.sessions.has(newLiveSession.id)).toBe(true);
  });
});
